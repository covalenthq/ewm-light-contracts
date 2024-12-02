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

describe('EwmNftController - Reward Token Ids', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let cqtContract;
  let expiryTime;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    const delegators = await getDelegators();
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentTimestamp = currentBlock.timestamp;
    expiryTime = currentTimestamp + 3600; // 1 hour from now
    tokenHolderAddresses = tokenHolders.slice(0, 14).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 10);

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

    // Setup for tests
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await controllerContract.connect(owner).setExpiryRange(1, 5, expiryTime);
    await controllerContract.connect(owner).setExpiryRange(6, 10, expiryTime + 3600);
    await depositReward(cqtContract, controllerContract, oneToken.mul(100000));

    // Mint some tokens and set up users for testing
    for (let i = 0; i < 10; i++) {
      await controllerContract.connect(admin).mint(tokenHolderAddresses[i], 1);
      const tokenId = i + 1;
      const delegator = await ethers.getSigner(delegatorAddresses[i].address);
      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[i]))
        .setUser(tokenId, delegator.address);
    }
  });

  it('Should allow reward manager to distribute rewards', async () => {
    const tokenIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const amounts = [
      oneToken.mul(10),
      oneToken.mul(20),
      oneToken.mul(30),
      oneToken.mul(40),
      oneToken.mul(50),
      oneToken.mul(60),
      oneToken.mul(70),
      oneToken.mul(80),
      oneToken.mul(90),
      oneToken.mul(100),
    ];
    const initialRewardPool = await controllerContract.rewardPool();
    let totalReward = ethers.BigNumber.from(0);
    for (let i = 0; i < amounts.length; i++) {
      totalReward = totalReward.add(amounts[i]);
    }
    await giveEth('10.0', [rewarder]);
    await expect(controllerContract.connect(rewarder).rewardTokenIds(tokenIds, amounts))
      .to.emit(controllerContract, 'EventRewardsDisbursed')
      .withArgs(tokenIds.length);

    const finalRewardPool = await controllerContract.rewardPool();
    expect(finalRewardPool).to.equal(initialRewardPool.sub(totalReward));

    for (let i = 0; i < tokenIds.length; i++) {
      const userInfo = await controllerContract.getUserInfo(tokenIds[i]);
      expect(userInfo.redeemable).to.equal(amounts[i]);
    }
  });

  it('Should not allow non-reward manager to distribute rewards', async () => {
    const tokenIds = [1, 2, 3];
    const amounts = [oneToken.mul(10), oneToken.mul(20), oneToken.mul(30)];
    await expect(
      controllerContract.connect(admin).rewardTokenIds(tokenIds, amounts),
    ).to.be.revertedWith('Caller is not rewardManager role');
  });

  it('Should revert if arrays have different lengths', async () => {
    const tokenIds = [1, 2, 3];
    const invalidAmounts = [oneToken.mul(10), oneToken.mul(20)];
    await expect(
      controllerContract.connect(rewarder).rewardTokenIds(tokenIds, invalidAmounts),
    ).to.be.revertedWith('Given ids and amounts arrays must be of the same length');
  });

  it('Should revert if reward pool is insufficient', async () => {
    const tokenIds = [1, 2, 3];
    const currentRewardPool = await controllerContract.rewardPool();
    const excessiveAmounts = [currentRewardPool.add(1), oneToken, oneToken];
    const feeData = await ethers.provider.getFeeData();
    const rewarderBalance = await ethers.provider.getBalance(rewarder.address);
    expect(rewarderBalance).to.be.gt(ethers.utils.parseEther('99.0'));

    await expect(
      controllerContract.connect(rewarder).estimateGas.rewardTokenIds(tokenIds, excessiveAmounts, {
        value: 0,
        gasLimit: 1000000, // Set a high gas limit, adjust as needed
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      }),
    ).to.be.revertedWith('Insufficient funds in reward pool for rewardTokenIds');

    // console.log('gasEstimate', gasEstimate);
    // await expect(
    //   controllerContract.connect(rewarder).rewardTokenIds(tokenIds, excessiveAmounts, {
    //     value: 0,
    //     gasLimit: 1000000, // Set a high gas limit, adjust as needed
    //     maxFeePerGas: feeData.maxFeePerGas,
    //     maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    //   }),
    // ).to.be.revertedWith('Insufficient funds in reward pool for rewardTokenIds');
  });

  it('Should correctly update rewardPool after multiple reward distributions', async () => {
    const initialRewardPool = await controllerContract.rewardPool();
    const priorDistribution = [oneToken.mul(30), oneToken.mul(40)];
    const distribution1 = [oneToken.mul(5), oneToken.mul(10)];
    const distribution2 = [oneToken.mul(15), oneToken.mul(20)];
    const totalDistributed = distribution1
      .concat(distribution2)
      .reduce((a, b) => a.add(b), ethers.BigNumber.from(0));

    await controllerContract.connect(rewarder).rewardTokenIds([3, 4], distribution1);
    await controllerContract.connect(rewarder).rewardTokenIds([3, 4], distribution2);

    const finalRewardPool = await controllerContract.rewardPool();
    expect(finalRewardPool).to.equal(initialRewardPool.sub(totalDistributed));

    const userInfo3 = await controllerContract.getUserInfo(3);
    const userInfo4 = await controllerContract.getUserInfo(4);

    expect(userInfo3.redeemable).to.equal(
      priorDistribution[0].add(distribution2[0]).add(distribution1[0]),
    );
    expect(userInfo4.redeemable).to.equal(
      priorDistribution[1].add(distribution2[1]).add(distribution1[1]),
    );
  });

  it('Should emit EventRewardsFailedDueNFTExpired for expired NFTs', async () => {
    const expiredTokenId = 1;
    await ethers.provider.send('evm_increaseTime', [3601]);
    await ethers.provider.send('evm_mine');

    await expect(controllerContract.connect(rewarder).rewardTokenIds([expiredTokenId], [oneToken]))
      .to.emit(controllerContract, 'EventRewardsFailedDueNFTExpired')
      .withArgs(expiredTokenId, oneToken);

    const userInfo = await controllerContract.getUserInfo(expiredTokenId);
    expect(userInfo.redeemable).to.equal(oneToken.mul(10));
  });

  it('Should correctly handle a mix of valid and expired NFTs', async () => {
    const expiredTokenId = 1;
    const validTokenId = 6;
    const initialRewardPool = await controllerContract.rewardPool();
    const rewardAmount = oneToken.mul(10);

    await expect(
      controllerContract
        .connect(rewarder)
        .rewardTokenIds([expiredTokenId, validTokenId], [rewardAmount, rewardAmount]),
    )
      .to.emit(controllerContract, 'EventRewardsFailedDueNFTExpired')
      .withArgs(expiredTokenId, rewardAmount)
      .and.to.emit(controllerContract, 'EventRewardsDisbursed')
      .withArgs(2);

    const finalRewardPool = await controllerContract.rewardPool();
    expect(finalRewardPool).to.equal(initialRewardPool.sub(rewardAmount));

    const expiredUserInfo = await controllerContract.getUserInfo(expiredTokenId);
    const validUserInfo = await controllerContract.getUserInfo(validTokenId);
    expect(expiredUserInfo.redeemable).to.equal(oneToken.mul(10)); //redeemable don't change for expired tokens
    expect(validUserInfo.redeemable).to.equal(oneToken.mul(70));
  });
});
