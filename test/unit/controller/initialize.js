const { expect } = require('chai');
const { impersonateAll, deployCxtFaucet, getOwner, getRewardsManager } = require('../../helpers');

describe('Initialize EwmNftController contract', () => {
  it('Should emit Initialized event with correct args.', async () => {
    await impersonateAll();
    const owner = await getOwner();
    const rewarder = await getRewardsManager();
    const cxt = await deployCxtFaucet();
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    const controllerContract = await upgrades.deployProxy(
      controller,
      [cxt.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );

    await expect(controllerContract.deployTransaction)
      .to.emit(controllerContract, 'EventInitialized')
      .withArgs(
        cxt.address,
        owner.address,
        owner.address,
        owner.address,
        rewarder.address,
        false,
        1,
        true,
      );
  });

  it('Cannot call initialize tx twice', async () => {
    await impersonateAll();
    const owner = await getOwner();
    const rewarder = await getRewardsManager();
    const cxt = await deployCxtFaucet();
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    const contract = await upgrades.deployProxy(
      controller,
      [cxt.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    const controllerContract = await contract.deployed();
    const error = 'Initializable: contract is already initialized';
    await expect(
      controllerContract.initialize(
        cxt.address,
        owner.address,
        owner.address,
        owner.address,
        rewarder.address,
      ),
    ).to.revertedWith(error);
  });
});
