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
} = require('./helpers');

describe('EwmNftController - Reward Load Testing', () => {
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
    tokenHolderAddresses = tokenHolders.slice(0, 10).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 10);
    expiryTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

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
    await controllerContract.setExpiryRange(1, 100, expiryTime);
    await depositReward(cqtContract, controllerContract, oneToken.mul(1000000));
    await giveEth('1.0', [rewarder]);
    //Mint some tokens and set up users for testing
    for (let i = 0; i < 700; i++) {
      await controllerContract.connect(admin).mint(tokenHolderAddresses[i % 10], 1);
      const tokenId = i + 1;
      const delegator = await ethers.getSigner(delegatorAddresses[i % 10].address);

      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[i % 10]))
        .setUser(tokenId, delegator.address);
    }
  });

  async function loadTest(tokenCount) {
    const tokenIds = Array.from({ length: tokenCount }, (_, i) => i + 1);
    const amounts = Array.from({ length: tokenCount }, () => oneToken);

    const initialRewardPool = await controllerContract.rewardPool();
    const totalReward = amounts.reduce((a, b) => a.add(b), ethers.BigNumber.from(0));

    // Arbitrum-specific gas parameters
    const maxFeePerGas = ethers.utils.parseUnits('0.1', 'gwei'); // 0.1 gwei
    const maxPriorityFeePerGas = ethers.utils.parseUnits('0.05', 'gwei'); // 0.05 gwei

    const tx = await controllerContract.connect(rewarder).rewardTokenIds(tokenIds, amounts, {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit: 32000000, // 32 million gas limit
    });
    const receipt = await tx.wait();

    const finalRewardPool = await controllerContract.rewardPool();
    expect(finalRewardPool).to.equal(initialRewardPool.sub(totalReward));

    console.log(`Gas used for ${tokenCount} tokens:`, receipt.gasUsed.toString());
    console.log(
      `ETH used for ${tokenCount} tokens:`,
      ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice)),
    );
  }

  it('Should handle 50 token rewards', async () => {
    await loadTest(50);
  });

  it('Should handle 150 token rewards', async () => {
    await loadTest(150);
  });

  it('Should handle 250 token rewards', async () => {
    await loadTest(250);
  });

  it('Should handle 350 token rewards', async () => {
    await loadTest(350);
  });

  it('Should handle 450 token rewards', async () => {
    await loadTest(450);
  });

  it('Should handle 500 token rewards', async () => {
    await loadTest(500);
  });
  it('Should handle 700 token rewards', async () => {
    await loadTest(700);
  });

  //   it('Should handle 1000 token rewards', async () => {
  //     await loadTest(1000);
  //   });

  //   it('Should discover the upper limit on the size of the arrays', async () => {
  //     let tokenCount = 1000;
  //     let success = true;

  //     while (success) {
  //       try {
  //         await loadTest(tokenCount);
  //         tokenCount += 100;
  //       } catch (error) {
  //         success = false;
  //         console.log(`Upper limit discovered: ${tokenCount - 100} tokens`);
  //       }
  //     }
  //   });
});
