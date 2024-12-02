const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getDelegators,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Batch Transfer', () => {
  let controllerContract;
  let owner;
  let admin;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let rewarder;
  let expiryTime;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const delegators = await getDelegators();
    const tokenHolders = await getTokenHolders();
    rewarder = await getRewardsManager();
    tokenHolderAddresses = tokenHolders.slice(0, 14).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 10);
    const cqtContract = await deployMockCqtContract(owner);
    expiryTime = Math.floor(Date.now() / 1000) + 3600;
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();

    // Setup for tests
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    // Set up the whitelist
    await controllerContract
      .connect(admin)
      .updateTransferWhiteList([tokenHolderAddresses[13]], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 3600);
    await controllerContract.connect(owner).setExpiryRange(1, 100, expiryTime);
  });

  it('Should allow batch transfer of multiple tokens', async () => {
    await controllerContract.connect(admin).mint(owner.address, 15);
    const recipients = tokenHolderAddresses.slice(0, 10);
    const tokenIds = Array.from({ length: 10 }, (_, i) => i + 1);

    await expect(controllerContract.connect(owner).batchTransfer(recipients, tokenIds)).to.not.be
      .reverted;

    for (let i = 0; i < 10; i++) {
      expect(await controllerContract.ownerOf(tokenIds[i])).to.equal(recipients[i]);
    }
  });

  it('Should revert batch transfer if arrays have different lengths', async () => {
    const recipients = tokenHolderAddresses.slice(0, 5);
    const tokenIds = [1, 2, 3];

    await expect(controllerContract.batchTransfer(recipients, tokenIds)).to.be.revertedWith(
      'array length should be same',
    );
  });

  it('Should revert batch transfer if sender is not the owner of all tokens', async () => {
    const recipients = tokenHolderAddresses.slice(10, 12);
    const tokenIds = [11, 12];

    await expect(
      controllerContract.connect(admin).batchTransfer(recipients, tokenIds),
    ).to.be.revertedWith('ERC721: caller is not token owner or approved');
  });

  it('Should revert batch transfer if any token is banned', async () => {
    const recipients = tokenHolderAddresses.slice(10, 12);
    const tokenIds = [11, 12];

    const banEndTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await controllerContract.connect(admin).ban(tokenIds[0], banEndTime);

    await expect(
      controllerContract.connect(owner).batchTransfer(recipients, tokenIds),
    ).to.be.revertedWith('token is banned');

    // Unban the token for further tests
    await controllerContract.connect(admin).unBan(tokenIds[0]);
  });

  it('Should revert batch transfer if NFT is not transferable and sender is not whitelisted', async () => {
    const recipients = tokenHolderAddresses.slice(0, 2);
    const tokenIds = [1, 2];

    await expect(
      controllerContract.connect(admin).batchTransfer(recipients, tokenIds),
    ).to.be.revertedWith('ERC721: caller is not token owner or approved');
  });

  it('Should allow batch transfer if NFT is not transferable but sender is whitelisted', async () => {
    await controllerContract.connect(admin).updateTransferWhiteList([owner.address], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 3600);

    const recipients = tokenHolderAddresses.slice(10, 12);
    const tokenIds = [11, 12];

    await expect(controllerContract.batchTransfer(recipients, tokenIds)).to.not.be.reverted;

    for (let i = 0; i < 2; i++) {
      expect(await controllerContract.ownerOf(tokenIds[i])).to.equal(recipients[i]);
    }
  });

  it('Should reset user info after batch transfer', async () => {
    const tokenId = 13;
    const delegator = await ethers.getSigner(delegatorAddresses[1].address);

    await controllerContract.connect(owner).setUser(tokenId, delegator.address);

    const recipients = [tokenHolderAddresses[12]];
    const tokenIds = [tokenId];

    await controllerContract.batchTransfer(recipients, tokenIds);

    const userInfo = await controllerContract.getUserInfo(tokenId);
    expect(userInfo.user).to.equal(ethers.constants.AddressZero);
    expect(userInfo.expires).to.equal(expiryTime);
  });
});
