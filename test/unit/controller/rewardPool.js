const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getOwner,
  depositReward,
  deployMockCqtContract,
  oneToken,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Reward Pool', () => {
  let controllerContract;
  let owner;
  let admin;
  let cqtContract;
  let rewarder;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();

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
  });

  describe('depositRewardTokens', () => {
    it('Should allow owner to deposit reward tokens', async () => {
      const depositAmount = oneToken.mul(100);
      await expect(controllerContract.depositRewardTokens(depositAmount))
        .to.emit(controllerContract, 'EventRewardTokensDeposited')
        .withArgs(depositAmount);

      const rewardPool = await controllerContract.rewardPool();
      expect(rewardPool).to.equal(depositAmount);
    });

    it('Should not allow non-owner to deposit reward tokens', async () => {
      const depositAmount = oneToken.mul(50);
      await expect(
        controllerContract.connect(admin).depositRewardTokens(depositAmount),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should not allow depositing zero tokens', async () => {
      await expect(controllerContract.depositRewardTokens(0)).to.be.revertedWith('Amount is 0');
    });

    it('Should update reward pool correctly after multiple deposits', async () => {
      const initialRewardPool = await controllerContract.rewardPool();
      const depositAmount1 = oneToken.mul(50);
      const depositAmount2 = oneToken.mul(75);

      await controllerContract.depositRewardTokens(depositAmount1);
      await controllerContract.depositRewardTokens(depositAmount2);

      const finalRewardPool = await controllerContract.rewardPool();
      expect(finalRewardPool).to.equal(initialRewardPool.add(depositAmount1).add(depositAmount2));
    });

    it('Should use depositReward helper function correctly', async () => {
      const initialRewardPool = await controllerContract.rewardPool();
      const depositAmount = oneToken.mul(100);

      await depositReward(cqtContract, controllerContract, depositAmount);

      const finalRewardPool = await controllerContract.rewardPool();
      expect(finalRewardPool).to.equal(initialRewardPool.add(depositAmount));
    });
  });

  describe('takeOutRewardTokens', () => {
    before(async () => {
      // Ensure there are tokens in the reward pool
      await depositReward(cqtContract, controllerContract, oneToken.mul(1000));
    });

    it('Should allow owner to take out reward tokens', async () => {
      const initialRewardPool = await controllerContract.rewardPool();
      const withdrawAmount = oneToken.mul(100);

      await expect(controllerContract.takeOutRewardTokens(withdrawAmount))
        .to.emit(controllerContract, 'EventRewardTokensWithdrawn')
        .withArgs(withdrawAmount);

      const finalRewardPool = await controllerContract.rewardPool();
      expect(finalRewardPool).to.equal(initialRewardPool.sub(withdrawAmount));
    });

    it('Should not allow non-owner to take out reward tokens', async () => {
      const withdrawAmount = oneToken.mul(50);
      await expect(
        controllerContract.connect(admin).takeOutRewardTokens(withdrawAmount),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should not allow withdrawing zero tokens', async () => {
      await expect(controllerContract.takeOutRewardTokens(0)).to.be.revertedWith('Amount is 0');
    });

    it('Should not allow withdrawing more tokens than available in the reward pool', async () => {
      const rewardPool = await controllerContract.rewardPool();
      const excessAmount = rewardPool.add(oneToken);

      await expect(controllerContract.takeOutRewardTokens(excessAmount)).to.be.revertedWith(
        'Reward pool is too small',
      );
    });

    it('Should update reward pool correctly after multiple withdrawals', async () => {
      const initialRewardPool = await controllerContract.rewardPool();
      const withdrawAmount1 = oneToken.mul(50);
      const withdrawAmount2 = oneToken.mul(75);

      await controllerContract.takeOutRewardTokens(withdrawAmount1);
      await controllerContract.takeOutRewardTokens(withdrawAmount2);

      const finalRewardPool = await controllerContract.rewardPool();
      expect(finalRewardPool).to.equal(initialRewardPool.sub(withdrawAmount1).sub(withdrawAmount2));
    });
  });
});
