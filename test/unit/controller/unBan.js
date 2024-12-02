const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Un-Ban', () => {
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

  it('Should allow ban admin to unban a token', async () => {
    const tokenId = 1;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp + 3600; // 1 hour from now

    await controllerContract.connect(admin).ban(tokenId, endTime);

    await expect(controllerContract.connect(admin).unBan(tokenId))
      .to.emit(controllerContract, 'EventBanUpdated')
      .withArgs(tokenHolderAddresses[1], tokenId, 0);

    const banEndTime = await controllerContract.getBanEndTime(tokenId);
    expect(banEndTime).to.equal(0);
  });

  it('Should not allow non-ban admin to unban a token', async () => {
    const tokenId = 2;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp + 3600;

    await controllerContract.connect(admin).ban(tokenId, endTime);

    await expect(controllerContract.connect(owner).unBan(tokenId)).to.be.revertedWith(
      'only ban admin',
    );
  });

  it('Should allow unbanning an already unbanned token', async () => {
    const tokenId = 3;

    // Ensure the token is not banned
    expect(await controllerContract.isBanned(tokenId)).to.be.false;

    await expect(controllerContract.connect(admin).unBan(tokenId))
      .to.emit(controllerContract, 'EventBanUpdated')
      .withArgs(tokenHolderAddresses[1], tokenId, 0);

    expect(await controllerContract.isBanned(tokenId)).to.be.false;
  });

  it('Should revert when trying to unban a non-existent token', async () => {
    const nonExistentTokenId = 100;

    await expect(controllerContract.connect(admin).unBan(nonExistentTokenId)).to.be.revertedWith(
      'ERC721: invalid token ID',
    );
  });

  it('Should allow unbanning multiple tokens', async () => {
    const tokenIds = [1, 2, 3, 4, 5];
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp + 3600;

    // Ban all tokens first
    for (const tokenId of tokenIds) {
      await controllerContract.connect(admin).ban(tokenId, endTime);
    }

    // Unban all tokens
    for (const tokenId of tokenIds) {
      await expect(controllerContract.connect(admin).unBan(tokenId))
        .to.emit(controllerContract, 'EventBanUpdated')
        .withArgs(tokenHolderAddresses[1], tokenId, 0);
    }

    // Verify all tokens are unbanned
    for (const tokenId of tokenIds) {
      expect(await controllerContract.isBanned(tokenId)).to.be.false;
    }
  });

  it('Should allow unbanning a token before its ban period ends', async () => {
    const tokenId = 4;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp + 3600; // 1 hour from now

    await controllerContract.connect(admin).ban(tokenId, endTime);
    expect(await controllerContract.isBanned(tokenId)).to.be.true;

    await controllerContract.connect(admin).unBan(tokenId);
    expect(await controllerContract.isBanned(tokenId)).to.be.false;
  });

  it('Should not affect other token operations when a token is unbanned', async () => {
    const tokenId = 5;
    const currentBlockTimestamp = await ethers.provider.getBlock('latest').then((b) => b.timestamp);
    const endTime = currentBlockTimestamp + 3600;
    const baseUrl = 'https://storage.googleapis.com/covalent-project/emw-lc/';

    await controllerContract.setBaseUrl(baseUrl);
    await controllerContract.connect(admin).ban(tokenId, endTime);
    await controllerContract.connect(admin).unBan(tokenId);

    expect(await controllerContract.ownerOf(tokenId)).to.equal(tokenHolderAddresses[1]);

    const actualUri = await controllerContract.tokenURI(tokenId);
    const expectedUri = `${baseUrl}${tokenId}`;

    expect(actualUri).to.equal(expectedUri);
  });
});
