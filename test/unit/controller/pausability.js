const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getDelegators,
  getOwner,
  getRewardsManager,
  depositReward,
  deployMockCqtContract,
  giveEth,
  oneToken,
} = require('../../helpers');

describe('EwmNftController - Pausability', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let expiryTime;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    const delegators = await getDelegators();
    tokenHolderAddresses = tokenHolders.slice(0, 14).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 10);
    // console.log('NFT Holder Addresses:');
    // for (let i = 0; i < tokenHolderAddresses.length; i++) {
    //   console.log(`${i + 1}: ${tokenHolderAddresses[i]}`);
    // }
    // console.log('Delegated Addresses:');
    // for (let i = 0; i < delegatorAddresses.length; i++) {
    //   console.log(`${i + 1}: ${delegatorAddresses[i].address}`);
    // }
    const cqtContract = await deployMockCqtContract(owner);
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    expiryTime = Math.floor(Date.now() / 1000) + 3600;
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();

    // Setup for tests that require additional configuration
    await controllerContract.setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await controllerContract.connect(owner).setExpiryRange(1, 100, expiryTime);
    await depositReward(cqtContract, controllerContract, oneToken.mul(100));
    // const metadata = await controllerContract.getMetadata();
    // console.log('Contract metadata:\n', metadata);
  });

  it('Should be unpaused after initialization', async () => {
    expect(await controllerContract.paused()).to.be.false;
  });

  it('Should allow owner to pause the contract', async () => {
    await expect(controllerContract.pause())
      .to.emit(controllerContract, 'EventContractPaused')
      .withArgs(owner.address);

    expect(await controllerContract.paused()).to.be.true;
  });

  it('Should not allow non-owner to pause the contract', async () => {
    await controllerContract.unpause();
    await expect(controllerContract.connect(admin).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow owner to unpause the contract', async () => {
    await controllerContract.pause();
    await expect(controllerContract.unpause())
      .to.emit(controllerContract, 'EventContractUnpaused')
      .withArgs(owner.address);

    expect(await controllerContract.paused()).to.be.false;
  });

  it('Should not allow non-owner to unpause the contract', async () => {
    await controllerContract.pause();
    await expect(controllerContract.connect(admin).unpause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
    await controllerContract.unpause();
  });

  it('Should not allow pausing an already paused contract', async () => {
    await controllerContract.pause();
    await expect(controllerContract.pause()).to.be.revertedWith('paused');
    await controllerContract.unpause();
  });

  it('Should not allow unpausing an already unpaused contract', async () => {
    await expect(controllerContract.unpause()).to.be.revertedWith('must be paused');
  });

  it('Should prevent minting when paused', async () => {
    await controllerContract.pause();
    await expect(controllerContract.mint(admin.address, 1)).to.be.revertedWith('paused');
    await controllerContract.unpause();
  });

  it('Should allow minting when unpaused', async () => {
    await expect(controllerContract.mint(owner.address, 1)).to.not.be.reverted;
  });

  it('Should prevent batch transfer when paused', async () => {
    await controllerContract.pause();
    await expect(controllerContract.batchTransfer([admin.address], [1])).to.be.revertedWith(
      'paused',
    );
    await controllerContract.unpause();
  });

  it('Should allow batch transfer of 10 tokens to 10 token holders when unpaused', async () => {
    await controllerContract.mint(owner.address, 9);
    const firstTenTokenHolderAddresses = tokenHolderAddresses.slice(0, 10);
    const tokenIds = Array.from({ length: 10 }, (_, i) => i + 1);
    // Set up the whitelist
    await controllerContract
      .connect(admin)
      .updateTransferWhiteList([tokenHolderAddresses[13]], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 3600);
    // console.log('Is in whitelist:\n');
    // for (const address of tokenHolderAddresses) {
    //   const isWhitelisted = await controllerContract.isInTransferWhitelist(address);
    //   console.log(`${address}: ${isWhitelisted}`);
    // }
    await expect(controllerContract.batchTransfer(firstTenTokenHolderAddresses, tokenIds)).to.not.be
      .reverted;
    for (let i = 0; i < 10; i++) {
      expect(await controllerContract.ownerOf(tokenIds[i])).to.equal(tokenHolderAddresses[i]);
    }
  });

  it('Should prevent reward token distribution when paused', async () => {
    await controllerContract.pause();
    await giveEth('100.0', [rewarder]);
    await expect(
      controllerContract.connect(rewarder).rewardTokenIds([1], [100]),
    ).to.be.revertedWith('paused');
    await controllerContract.unpause();
  });

  it('Should allow reward token distribution when unpaused', async () => {
    const initialMetadata = await controllerContract.getMetadata();
    const initialRewardPool = initialMetadata._rewardPool;
    const holder = await ethers.getSigner(tokenHolderAddresses[0]);
    const delegator = await ethers.getSigner(delegatorAddresses[0].address);
    // const getUserInfo = await controllerContract.getUserInfo(1);
    // console.log('Pre Set User Info:\n', getUserInfo);
    await expect(controllerContract.connect(holder).setUser(1, delegator.address)).to.not.be
      .reverted;
    await expect(controllerContract.connect(rewarder).rewardTokenIds([1], [oneToken.mul(1)])).to.not
      .be.reverted;
    // const getUserInfo2 = await controllerContract.getUserInfo(1);
    // console.log('Post Set User Info:\n', getUserInfo2);
    const updatedMetadata = await controllerContract.getMetadata();
    const updatedRewardPool = updatedMetadata._rewardPool;
    expect(updatedRewardPool).to.equal(initialRewardPool.sub(oneToken.mul(1)));
  });
});
