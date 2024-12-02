const { expect } = require('chai');
const {
  impersonateAll,
  getOwner,
  getAdmin,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Set Base Url', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const cqtContract = await deployMockCqtContract(owner);
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

  it('Should allow owner to set base URL', async () => {
    const newBaseUrl = 'https://example.com/nft/';
    await expect(controllerContract.setBaseUrl(newBaseUrl)).to.not.be.reverted;

    const metadata = await controllerContract.getMetadata();
    expect(metadata._baseUrl).to.equal(newBaseUrl);
  });

  it('Should not allow non-owner to set base URL', async () => {
    const newBaseUrl = 'https://attacker.com/nft/';
    await expect(controllerContract.connect(admin).setBaseUrl(newBaseUrl)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow owner to update base URL multiple times', async () => {
    const firstUrl = 'https://first.com/nft/';
    const secondUrl = 'https://second.com/nft/';

    await controllerContract.setBaseUrl(firstUrl);
    let metadata = await controllerContract.getMetadata();
    expect(metadata._baseUrl).to.equal(firstUrl);

    await controllerContract.setBaseUrl(secondUrl);
    metadata = await controllerContract.getMetadata();
    expect(metadata._baseUrl).to.equal(secondUrl);
  });

  it('Should allow setting an empty string as base URL', async () => {
    const emptyUrl = '';
    await expect(controllerContract.setBaseUrl(emptyUrl)).to.not.be.reverted;

    const metadata = await controllerContract.getMetadata();
    expect(metadata._baseUrl).to.equal(emptyUrl);
  });

  it('Should emit an event when base URL is set', async () => {
    // Note: You'll need to add an event for setBaseUrl in the contract for this test
    const newBaseUrl = 'https://newexample.com/nft/';
    await expect(controllerContract.setBaseUrl(newBaseUrl))
      .to.emit(controllerContract, 'EventBaseUrlSet')
      .withArgs(newBaseUrl);
  });
});
