const { expect } = require('chai');
const { impersonateAll, deployCxtFaucet, getOwner, getRewardsManager } = require('../../helpers');

describe('EwmNftController - Get Metadata', () => {
  let controllerContract;
  let owner;
  let rewarder;
  let cxt;
  let expiryTime;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    rewarder = await getRewardsManager();
    cxt = await deployCxtFaucet();
    expiryTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxt.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();
    await controllerContract.setExpiryRange(1, 100, expiryTime);
  });

  it('Should return correct metadata after initialization', async () => {
    const metadata = await controllerContract.getMetadata();
    // console.log(metadata);
    expect(metadata._cxt).to.equal(cxt.address);
    expect(metadata._minterAdmin).to.equal(owner.address);
    expect(metadata._banAdmin).to.equal(owner.address);
    expect(metadata._whitelistAdmin).to.equal(owner.address);
    expect(metadata._rewardManager).to.equal(rewarder.address);
    expect(metadata._nextTokenId).to.equal(1);
    expect(metadata._rewardPool).to.equal(0);
    expect(metadata._nftTransferable).to.equal(false);
    expect(metadata._baseUrl).to.equal('');
    expect(metadata._expiryRanges).to.be.an('array').that.has.lengthOf(1);
    expect(metadata._expiryRanges[0].startTokenId).to.equal(1);
    expect(metadata._expiryRanges[0].endTokenId).to.equal(100);
    expect(metadata._expiryRanges[0].expiryTime).to.equal(expiryTime);
  });

  it('Should reflect changes in metadata', async () => {
    const [, addr1] = await ethers.getSigners();
    const newExpiryRange = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await controllerContract.updateRewardAdmin(addr1.address);
    await controllerContract.setBaseUrl('https://example.com/');
    await controllerContract.updateNftTransferable(true);
    await controllerContract.setExpiryRange(101, 200, newExpiryRange);

    const updatedMetadata = await controllerContract.getMetadata();
    expect(updatedMetadata._rewardManager).to.equal(addr1.address);
    expect(updatedMetadata._baseUrl).to.equal('https://example.com/');
    expect(updatedMetadata._nftTransferable).to.equal(true);
    expect(updatedMetadata._cxt).to.equal(cxt.address);
    expect(updatedMetadata._minterAdmin).to.equal(owner.address);
    expect(updatedMetadata._banAdmin).to.equal(owner.address);
    expect(updatedMetadata._whitelistAdmin).to.equal(owner.address);
    expect(updatedMetadata._expiryRanges).to.be.an('array').that.has.lengthOf(2);
    expect(updatedMetadata._expiryRanges[1].startTokenId).to.equal(101);
    expect(updatedMetadata._expiryRanges[1].endTokenId).to.equal(200);
    expect(updatedMetadata._expiryRanges[1].expiryTime).to.equal(newExpiryRange);

    // console.log(updatedMetadata);
  });
});
