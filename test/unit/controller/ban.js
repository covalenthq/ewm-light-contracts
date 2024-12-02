const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
  //   oneToken,
} = require('../../helpers');

describe('EwmNftController - Ban', () => {
  let controllerContract;
  let owner;
  let admin;
  let tokenHolderAddresses;
  let rewarder;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 5).map((holder) => holder.address);

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

    // Setup for tests
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);

    // Mint some tokens for testing
    await controllerContract.connect(admin).mint(tokenHolderAddresses[1], 5);
  });

  it('Should allow ban admin to ban a token', async () => {
    const tokenId = 1;
    const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    await expect(controllerContract.connect(admin).ban(tokenId, endTime))
      .to.emit(controllerContract, 'EventBanUpdated')
      .withArgs(tokenHolderAddresses[1], tokenId, endTime);

    const banEndTime = await controllerContract.getBanEndTime(tokenId);
    expect(banEndTime).to.equal(endTime);
  });

  it('Should not allow non-ban admin to ban a token', async () => {
    const tokenId = 2;
    const endTime = Math.floor(Date.now() / 1000) + 3600;

    await expect(controllerContract.connect(owner).ban(tokenId, endTime)).to.be.revertedWith(
      'only ban admin',
    );
  });

  it('Should not allow banning with end time in the past', async () => {
    const tokenId = 3;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp - 1;

    await expect(controllerContract.connect(admin).ban(tokenId, endTime)).to.be.revertedWith(
      'invalid end time',
    );
  });

  it('Should not allow banning a non-existent token', async () => {
    const nonExistentTokenId = 100;
    const endTime = Math.floor(Date.now() / 1000) + 3600;

    await expect(
      controllerContract.connect(admin).ban(nonExistentTokenId, endTime),
    ).to.be.revertedWith('invalid token id');
  });

  it('Should allow updating ban end time for an already banned token', async () => {
    const tokenId = 4;
    const initialEndTime = Math.floor(Date.now() / 1000) + 3600;
    const updatedEndTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

    await controllerContract.connect(admin).ban(tokenId, initialEndTime);

    await expect(controllerContract.connect(admin).ban(tokenId, updatedEndTime))
      .to.emit(controllerContract, 'EventBanUpdated')
      .withArgs(tokenHolderAddresses[1], tokenId, updatedEndTime);

    const banEndTime = await controllerContract.getBanEndTime(tokenId);
    expect(banEndTime).to.equal(updatedEndTime);
  });

  it('Should allow banning multiple tokens', async () => {
    const tokenIds = [1, 2, 3, 4, 5];
    const endTime = Math.floor(Date.now() / 1000) + 3600;

    for (const tokenId of tokenIds) {
      await expect(controllerContract.connect(admin).ban(tokenId, endTime))
        .to.emit(controllerContract, 'EventBanUpdated')
        .withArgs(tokenHolderAddresses[1], tokenId, endTime);
    }

    for (const tokenId of tokenIds) {
      const banEndTime = await controllerContract.getBanEndTime(tokenId);
      expect(banEndTime).to.equal(endTime);
    }
  });

  it('Should return correct ban status', async () => {
    const tokenId = 1;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);

    const endTime = currentBlockTimestamp + 3600; // 1 hour from now

    await controllerContract.connect(admin).ban(tokenId, endTime);

    expect(await controllerContract.isBanned(tokenId)).to.be.true;

    // Fast-forward time
    await ethers.provider.send('evm_increaseTime', [3601]);
    await ethers.provider.send('evm_mine');

    expect(await controllerContract.isBanned(tokenId)).to.be.false;
  });

  it('Should not affect other token operations when a token is banned', async () => {
    const tokenId = 5;
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const baseUrl = 'https://storage.googleapis.com/covalent-project/emw-lc/';
    await controllerContract.setBaseUrl(baseUrl);
    await controllerContract.connect(admin).ban(tokenId, endTime);

    expect(await controllerContract.ownerOf(tokenId)).to.equal(tokenHolderAddresses[1]);

    const actualUri = await controllerContract.tokenURI(tokenId);
    const expectedUri = `${baseUrl}${tokenId}`;

    expect(actualUri).to.equal(expectedUri);
  });
});
