const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
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

describe('EwmNftController - Redeem Rewards', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let cqtContract;
  let expiryTime;
  const REWARD_REDEEM_THRESHOLD = ethers.utils.parseUnits('1', 8); // 10^8 as per the contract

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    const delegators = await getDelegators();
    tokenHolderAddresses = tokenHolders.slice(0, 5).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 10);
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentTimestamp = currentBlock.timestamp;
    // set expiry time to 1 hour from current timestamp
    expiryTime = currentTimestamp + 3600;
    cqtContract = await deployMockCqtContract(owner);
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();

    // Setup
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await controllerContract.setExpiryRange(1, 100, expiryTime);
    await depositReward(cqtContract, controllerContract, oneToken.mul(10000));
    await giveEth('10.0', [rewarder]);

    // Set allowance for the NFTController to transfer CQT tokens
    await cqtContract
      .connect(owner)
      .approve(controllerContract.address, ethers.constants.MaxUint256);
  });

  async function mintAndSetUser(holderAddress, tokenId, delegatorAddress) {
    await controllerContract.connect(admin).mint(holderAddress, 1);
    const holder = await ethers.getSigner(holderAddress);
    await controllerContract.connect(holder).setUser(tokenId, delegatorAddress);
  }

  it('Should not allow redeeming rewards when no tokens are owned', async () => {
    const nonHolder = await ethers.getSigner(delegatorAddresses[0].address);
    await expect(controllerContract.connect(nonHolder).redeemRewards()).to.be.revertedWith(
      'No tokens owned',
    );
  });

  it('Should not allow redeeming rewards when total redeemable is below threshold', async () => {
    await mintAndSetUser(tokenHolderAddresses[0], 1, delegatorAddresses[0].address);
    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([1], [REWARD_REDEEM_THRESHOLD.sub(1)]);

    await expect(
      controllerContract.connect(await ethers.getSigner(tokenHolderAddresses[0])).redeemRewards(),
    ).to.be.revertedWith('Total redeemable amount must be higher than redeem threshold');
  });

  it('Should allow redeeming rewards when conditions are met', async () => {
    await mintAndSetUser(tokenHolderAddresses[1], 2, delegatorAddresses[1].address);
    const rewardPoolBefore = await controllerContract.rewardPool();
    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([2], [REWARD_REDEEM_THRESHOLD.mul(2)]);

    const holder = await ethers.getSigner(tokenHolderAddresses[1]);
    const userInfoBefore = await controllerContract.getUserInfo(2);
    const redeemableAmount = userInfoBefore.redeemable;

    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, redeemableAmount).to.not.be.reverted;
    const userInfoAfter = await controllerContract.getUserInfo(2);
    expect(userInfoAfter.redeemable).to.equal(0);
    const rewardPoolAfter = await controllerContract.rewardPool();
    expect(rewardPoolAfter).to.equal(rewardPoolBefore.sub(redeemableAmount));
  });

  it('Should reset redeemable amount to zero after redeeming', async () => {
    const userInfo = await controllerContract.getUserInfo(2);
    expect(userInfo.redeemable).to.equal(0);
  });

  it('Should allow redeeming rewards for multiple tokens owned by the same holder', async () => {
    const holder = await ethers.getSigner(tokenHolderAddresses[2]);
    await mintAndSetUser(tokenHolderAddresses[2], 3, delegatorAddresses[2].address);
    await mintAndSetUser(tokenHolderAddresses[2], 4, delegatorAddresses[3].address);
    await mintAndSetUser(tokenHolderAddresses[2], 5, delegatorAddresses[4].address);
    const rewardPoolBefore = await controllerContract.rewardPool();
    await controllerContract
      .connect(rewarder)
      .rewardTokenIds(
        [3, 4, 5],
        [REWARD_REDEEM_THRESHOLD, REWARD_REDEEM_THRESHOLD.mul(2), REWARD_REDEEM_THRESHOLD.mul(3)],
      );

    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, REWARD_REDEEM_THRESHOLD.mul(6));

    const userInfoAfter = await controllerContract.getUserInfo(2);
    expect(userInfoAfter.redeemable).to.equal(0);
    const rewardPoolAfter = await controllerContract.rewardPool();
    expect(rewardPoolAfter).to.equal(rewardPoolBefore.sub(REWARD_REDEEM_THRESHOLD.mul(6)));
  });

  it('Should not allow redeeming when paused', async () => {
    await controllerContract.pause();
    await expect(
      controllerContract.connect(await ethers.getSigner(tokenHolderAddresses[0])).redeemRewards(),
    ).to.be.revertedWith('paused');
    await controllerContract.unpause();
  });

  it('Should handle case where some tokens have no rewards', async () => {
    await mintAndSetUser(tokenHolderAddresses[3], 6, delegatorAddresses[5].address);
    await mintAndSetUser(tokenHolderAddresses[3], 7, delegatorAddresses[6].address);
    const rewardPoolBefore = await controllerContract.rewardPool();
    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([6], [REWARD_REDEEM_THRESHOLD.mul(2)]);

    const holder = await ethers.getSigner(tokenHolderAddresses[3]);

    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, REWARD_REDEEM_THRESHOLD.mul(2));
    const rewardPoolAfter = await controllerContract.rewardPool();
    expect(rewardPoolAfter).to.equal(rewardPoolBefore.sub(REWARD_REDEEM_THRESHOLD.mul(2)));
  });

  it('Should update reward pool correctly after redeeming', async () => {
    const initialMetadata = await controllerContract.getMetadata();
    const initialRewardPool = initialMetadata._rewardPool;

    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([1], [REWARD_REDEEM_THRESHOLD.mul(5)]);
    await controllerContract
      .connect(await ethers.getSigner(tokenHolderAddresses[0]))
      .redeemRewards();

    const updatedMetadata = await controllerContract.getMetadata();
    const updatedRewardPool = updatedMetadata._rewardPool;

    expect(updatedRewardPool).to.equal(initialRewardPool.sub(REWARD_REDEEM_THRESHOLD.mul(5)));
  });

  it('Should allow redeeming rewards after updating user', async () => {
    const holder = await ethers.getSigner(tokenHolderAddresses[4]);
    await mintAndSetUser(tokenHolderAddresses[4], 8, delegatorAddresses[7].address);
    const rewardPoolBefore = await controllerContract.rewardPool();
    await controllerContract.connect(rewarder).rewardTokenIds([8], [REWARD_REDEEM_THRESHOLD]);

    // Update user
    // const newExpires = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
    await controllerContract.connect(holder).setUser(8, delegatorAddresses[8].address);

    // Add more rewards after updating user
    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([8], [REWARD_REDEEM_THRESHOLD.mul(2)]);

    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, REWARD_REDEEM_THRESHOLD.mul(3));
    const rewardPoolAfter = await controllerContract.rewardPool();
    expect(rewardPoolAfter).to.equal(rewardPoolBefore.sub(REWARD_REDEEM_THRESHOLD.mul(3)));
  });

  it('Should allow redeeming [accumulated] rewards even if a user has expired', async () => {
    const holder = await ethers.getSigner(tokenHolderAddresses[0]);
    await mintAndSetUser(tokenHolderAddresses[0], 9, delegatorAddresses[9].address);

    await controllerContract
      .connect(rewarder)
      .rewardTokenIds([9], [REWARD_REDEEM_THRESHOLD.mul(2)]);

    // Mine a new block with a timestamp 2 seconds in the future
    await ethers.provider.send('evm_increaseTime', [3601]); // 2 hours
    await ethers.provider.send('evm_mine');

    // Attempt to redeem rewards
    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, REWARD_REDEEM_THRESHOLD.mul(2));

    // Verify that the user has indeed expired
    const userInfo = await controllerContract.getUserInfo(9);
    const latestBlock = await ethers.provider.getBlock('latest');
    const latestTimestamp = latestBlock.timestamp;
    expect(userInfo.expires).to.be.lt(latestTimestamp);
  });

  it('Should allow redeeming rewards after user expiration and renewal', async () => {
    const holder = await ethers.getSigner(tokenHolderAddresses[0]);

    const rewardPoolBefore = await controllerContract.rewardPool();
    // Get current block timestamp
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentTimestamp = currentBlock.timestamp;

    // Renew user for 1 hour from the current block timestamp
    const newExpires = currentTimestamp + 3600; // 1 hour from now
    await controllerContract.connect(owner).updateExpiryRange(0, 1, 100, newExpires);
    await controllerContract.connect(holder).setUser(9, delegatorAddresses[9].address);

    // const initialUserInfo = await controllerContract.getUserInfo(9);
    // console.log('Initial User Info:', initialUserInfo);
    // Add more rewards
    await controllerContract.connect(rewarder).rewardTokenIds([9], [REWARD_REDEEM_THRESHOLD]);

    // Attempt to redeem rewards
    await expect(controllerContract.connect(holder).redeemRewards())
      .to.emit(controllerContract, 'EventRewardsRedeemed')
      .withArgs(holder.address, REWARD_REDEEM_THRESHOLD.mul(3));

    const finalUserInfo = await controllerContract.getUserInfo(9);
    // console.log('Final User Info:', finalUserInfo);

    const rewardPoolAfter = await controllerContract.rewardPool();
    expect(rewardPoolAfter).to.equal(rewardPoolBefore.sub(REWARD_REDEEM_THRESHOLD));
    // Verify that the user's expiration is in the future
    const latestBlock = await ethers.provider.getBlock('latest');
    expect(finalUserInfo.expires).to.be.gt(latestBlock.timestamp);
    expect(finalUserInfo.expires).to.be.equal(newExpires);
  });
});
