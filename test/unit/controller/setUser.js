const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getDelegators,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Set User', () => {
  let controllerContract;
  let owner;
  let admin;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let cqtContract;
  let rewarder;
  let expiryTime;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const tokenHolders = await getTokenHolders();
    const delegators = await getDelegators();
    rewarder = await getRewardsManager();
    const blockTime = await ethers.provider.getBlock('latest');
    const currentTimestamp = blockTime.timestamp;
    expiryTime = currentTimestamp + 3600; // 1 hour from now
    tokenHolderAddresses = tokenHolders.slice(0, 5).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 5).map((delegator) => delegator.address);

    cqtContract = await deployMockCqtContract(owner);
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    // Setup
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
  });

  it('Should allow token owner to set user', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 1);
    const tokenId = 1;
    await controllerContract.setExpiryRange(1, 10, expiryTime);
    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(tokenId, delegatorAddresses[0]),
    )
      .to.emit(controllerContract, 'UpdateUser')
      .withArgs(tokenId, delegatorAddresses[0], expiryTime);

    const userInfo = await controllerContract.getUserInfo(tokenId);
    expect(userInfo.user).to.equal(delegatorAddresses[0]);
    expect(userInfo.expires).to.equal(expiryTime);
  });

  it('Should not allow non-owner to set user', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[1], 1);
    const tokenId = 2;

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(tokenId, delegatorAddresses[1]),
    ).to.be.revertedWith('ERC4907: caller is not owner nor approved');
  });

  it('Should not allow setting user for non-existent token', async () => {
    const nonExistentTokenId = 100;

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(nonExistentTokenId, delegatorAddresses[0]),
    ).to.be.revertedWith('ERC721: invalid token ID');
  });

  it('Should not allow setting user for banned token', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[2], 1);
    const tokenId = 3;
    const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await controllerContract.connect(admin).ban(tokenId, expires);

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[2]))
        .setUser(tokenId, delegatorAddresses[2]),
    ).to.be.revertedWith('token is banned');
  });

  it('Should allow setting user to zero address', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[3], 1);
    const tokenId = 4;

    await controllerContract
      .connect(await ethers.getSigner(tokenHolderAddresses[3]))
      .setUser(tokenId, delegatorAddresses[3]);

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[3]))
        .setUser(tokenId, ethers.constants.AddressZero),
    )
      .to.emit(controllerContract, 'UpdateUser')
      .withArgs(tokenId, ethers.constants.AddressZero, expiryTime);

    const userInfo = await controllerContract.getUserInfo(tokenId);
    expect(userInfo.user).to.equal(ethers.constants.AddressZero);
    expect(userInfo.expires).to.equal(expiryTime);
  });

  it('Should allow setting user when contract is not paused', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[4], 1);
    const tokenId = 5;

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[4]))
        .setUser(tokenId, delegatorAddresses[4]),
    ).to.not.be.reverted;
  });

  it('Should not allow setting user when contract is paused', async () => {
    // Mint the token before pausing
    await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 1);
    const tokenId = 6;

    await controllerContract.pause();

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(tokenId, delegatorAddresses[0]),
    ).to.be.revertedWith('paused');

    await controllerContract.unpause();
  });

  it('Should allow token owner to batch set users to same delegator address with same expiry', async () => {
    // Mint multiple tokens to the same address
    await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 3);
    const tokenIds = [7, 8, 9];
    const users = Array(3).fill(delegatorAddresses[0]);

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .batchSetUser(tokenIds, users),
    )
      .to.emit(controllerContract, 'UpdateUser')
      .withArgs(tokenIds[0], users[0], expiryTime)
      .to.emit(controllerContract, 'UpdateUser')
      .withArgs(tokenIds[1], users[1], expiryTime)
      .to.emit(controllerContract, 'UpdateUser')
      .withArgs(tokenIds[2], users[2], expiryTime);

    // Verify the user info for each token
    for (let i = 0; i < tokenIds.length; i++) {
      const userInfo = await controllerContract.getUserInfo(tokenIds[i]);
      expect(userInfo.user).to.equal(users[i]);
      expect(userInfo.expires).to.equal(expiryTime);
    }
  });

  it('Should not allow non-owner to batch set users', async () => {
    const tokenIds = [7, 8, 9];
    const users = [delegatorAddresses[0], delegatorAddresses[1], delegatorAddresses[2]];

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[1])) // Different address than the token owner
        .batchSetUser(tokenIds, users),
    ).to.be.revertedWith('ERC4907: caller is not owner nor approved');
  });

  it('Should not allow batch set user when arrays have different lengths', async () => {
    const tokenIds = [7, 8, 9];
    const users = [delegatorAddresses[0], delegatorAddresses[1]]; // One less than tokenIds

    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .batchSetUser(tokenIds, users),
    ).to.be.revertedWith('array length should be same');
  });

  it('Should return 0 for token ID with no expiry range', async () => {
    await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 3);
    const userExpires = await controllerContract.userExpires(11);
    expect(userExpires).to.equal(0);
  });

  it('Should revert when setting user for expired token', async () => {
    // Move time past expiry
    await ethers.provider.send('evm_increaseTime', [3601]); // 1 hour + 1 second
    await ethers.provider.send('evm_mine');
    await expect(
      controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(1, delegatorAddresses[0]),
    ).to.be.revertedWith('token has expired');
  });
});
