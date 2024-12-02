const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  oneToken,
  generateMerkleTree,
  generateMerkleProof,
  getRewardsManager,
  deployCxtFaucet,
  depositReward,
} = require('../../helpers');

describe('EWM Light Client NFT - Secondary Integration Scenario', () => {
  let cxtContract;
  let controllerContract;
  let claimContract;
  let allowanceContract;
  let owner;
  let admin;
  let rewarder;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let user1;
  let user2;
  let tokenHolderAddresses;
  let firstThreeTokenHolderAddresses;

  const stakePrice = oneToken.mul(2500); // 1 nft = 2500 CXT
  const maxTotalStakeable = oneToken.mul(50000); //max 20 nfts

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    // claimAdmin = await ethers.getSigner(ethers.Wallet.createRandom().address);
    rewarder = await getRewardsManager();

    // Deploy CXT Faucet contract
    cxtContract = await deployCxtFaucet();

    // Set up times
    const currentBlock = await ethers.provider.getBlock('latest');
    startTime = currentBlock.timestamp + 7 * 24 * 60 * 60; // 1 week from now
    endTime = startTime + 7 * 24 * 60 * 60; // 1 week after startTime
    nftExpiryTime = startTime + 53 * 7 * 24 * 60 * 60; // 1 year + 1 week from startTime

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await depositReward(cxtContract, controllerContract, oneToken.mul(100));

    // Deploy claim contract
    const claim = await ethers.getContractFactory('EwmNftClaim', owner);
    claimContract = await claim.deploy(controllerContract.address, admin.address);
    await claimContract.deployed();

    // Update minterAdmin on controller contract
    await controllerContract.updateMinterAdmin(claimContract.address);

    // Deploy allowance contract
    const allowance = await ethers.getContractFactory('EwmNftAllowance', owner);
    allowanceContract = await allowance.deploy(
      stakePrice,
      cxtContract.address,
      controllerContract.address,
      startTime,
      endTime,
      maxTotalStakeable,
      nftExpiryTime,
    );
    await allowanceContract.deployed();

    // Register allowance contract in claim contract
    await claimContract.connect(admin).updateAllowanceContractsArray([allowanceContract.address]);
    await claimContract.connect(owner).unpause();

    // Setup whitelist for allowance contract
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 3).map((holder) => holder.address);
    firstThreeTokenHolderAddresses = tokenHolderAddresses.slice(0, 3);

    // eslint-disable-next-line no-undef
    [user1, user2, _] = firstThreeTokenHolderAddresses.map((address) =>
      ethers.provider.getSigner(address),
    );
    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.connect(owner).setWhitelistRootHash(rootHash);

    // Set integer allocation
    await allowanceContract.connect(owner).setIsIntegerAllocation(true);

    // Setup for controller contract
    await controllerContract
      .connect(owner)
      .setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');

    // Set up transfer whitelist for controller
    await controllerContract.connect(admin).updateTransferWhiteList([claimContract.address], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
    await controllerContract
      .connect(owner)
      .setExpiryRange(1, 100, Math.floor(Date.now() / 1000) + 3600);
    // Give CXT to users
    const cxtAmount = stakePrice.mul(20);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[0], cxtAmount);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[1], cxtAmount);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[2], cxtAmount);

    // const controllerMetadata = await controllerContract.getMetadata();
    // console.log('Controller metadata:\n', controllerMetadata);

    // const allowanceMetadata = await allowanceContract.getMetadata();
    // console.log('Allowance metadata:\n', allowanceMetadata);

    // const claimMetadata = await claimContract.getMetadata();
    // console.log('Claim metadata:\n', claimMetadata);
  });

  it('Should not allow users to stake more than the maximum allowed in a single allocation tx', async () => {
    await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
    await ethers.provider.send('evm_mine');

    const user = user1;
    const userAddress = await user.getAddress();
    const proof = generateMerkleProof(firstThreeTokenHolderAddresses, userAddress);

    await cxtContract.connect(user).approve(allowanceContract.address, stakePrice.mul(20));

    // First allocation should succeed
    await allowanceContract.connect(user).whitelistedAllocation(2, proof);

    await expect(
      allowanceContract.connect(user).whitelistedAllocation(11, proof),
    ).to.be.revertedWith('Can only stake 10 NFTs at max in integer allowance');
  });

  it('Should not allow users to stake more than max stakeable amount', async () => {
    const userX = user1;
    const userAddressX = await userX.getAddress();
    const proofX = generateMerkleProof(firstThreeTokenHolderAddresses, userAddressX);

    await cxtContract.connect(userX).approve(allowanceContract.address, stakePrice.mul(20));

    // First allocation should succeed
    await allowanceContract.connect(userX).whitelistedAllocation(10, proofX);

    const userY = user2;
    const userAddressY = await userY.getAddress();
    const proofY = generateMerkleProof(firstThreeTokenHolderAddresses, userAddressY);

    await cxtContract.connect(userY).approve(allowanceContract.address, stakePrice.mul(20));

    await expect(
      allowanceContract.connect(userY).whitelistedAllocation(9, proofY),
    ).to.be.revertedWith('Exceeds max total allowable stake');
  });

  it('Should not allow releasing allowance before NFT expiry', async () => {
    for (const user of [user1, user2]) {
      await expect(allowanceContract.connect(user).releaseNftStake(1)).to.be.revertedWith(
        'Allocation period has not ended',
      );
    }
  });
});
