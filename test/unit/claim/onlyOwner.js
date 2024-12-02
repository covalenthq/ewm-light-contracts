const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftClaim - Only Owner Functions', () => {
  let claimContract;
  let controllerContract;
  let owner;
  let newOwner;
  let admin;
  let user1;
  let user2;
  let rewarder;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const tokenHolders = await getTokenHolders();
    user1 = tokenHolders[0];
    user2 = tokenHolders[1];
    newOwner = tokenHolders[2];
    rewarder = await getRewardsManager();

    // Deploy mock CQT contract
    const cqtContract = await deployMockCqtContract(owner);

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    // Deploy claim contract
    const claim = await ethers.getContractFactory('EwmNftClaim', owner);
    claimContract = await claim.deploy(controllerContract.address, admin.address);
    await claimContract.deployed();
  });

  describe('updateClaimAdmin', () => {
    it('Should allow owner to update claim admin', async () => {
      await expect(claimContract.connect(owner).updateClaimAdmin(user1.address))
        .to.emit(claimContract, 'EventClaimAdminUpdated')
        .withArgs(user1.address);

      expect(await claimContract.claimAdminAddress()).to.equal(user1.address);
    });

    it('Should not allow non-owner to update claim admin', async () => {
      await expect(claimContract.connect(user2).updateClaimAdmin(user2.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('pause and unpause', () => {
    it('Should be paused after deployment', async () => {
      expect(await claimContract.paused()).to.be.true;
    });

    it('Should allow owner to unpause the contract', async () => {
      await expect(claimContract.connect(owner).unpause())
        .to.emit(claimContract, 'Unpaused')
        .withArgs(owner.address);

      expect(await claimContract.paused()).to.be.false;
    });

    it('Should allow owner to pause the contract after unpausing', async () => {
      await expect(claimContract.connect(owner).pause())
        .to.emit(claimContract, 'Paused')
        .withArgs(owner.address);

      expect(await claimContract.paused()).to.be.true;
    });

    it('Should not allow non-owner to pause the contract', async () => {
      await claimContract.connect(owner).unpause();
      await expect(claimContract.connect(user1).pause()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('Should not allow non-owner to unpause the contract', async () => {
      await claimContract.connect(owner).pause();
      await expect(claimContract.connect(user1).unpause()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('Should not allow pausing an already paused contract', async () => {
      await expect(claimContract.connect(owner).pause()).to.be.revertedWith('Pausable: paused');
    });

    it('Should not allow unpausing an already unpaused contract', async () => {
      await claimContract.connect(owner).unpause();
      await expect(claimContract.connect(owner).unpause()).to.be.revertedWith(
        'Pausable: not paused',
      );
    });
  });

  describe('transferOwnership', () => {
    it('Should allow owner to initiate ownership transfer', async () => {
      await expect(claimContract.connect(owner).transferOwnership(newOwner.address))
        .to.emit(claimContract, 'OwnershipTransferStarted')
        .withArgs(owner.address, newOwner.address);

      expect(await claimContract.pendingOwner()).to.equal(newOwner.address);
    });

    it('Should not allow non-owner to initiate ownership transfer', async () => {
      await expect(
        claimContract.connect(user1).transferOwnership(user1.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('acceptOwnership', () => {
    it('Should allow pending owner to accept ownership', async () => {
      await claimContract.connect(owner).transferOwnership(newOwner.address);
      await expect(claimContract.connect(newOwner).acceptOwnership())
        .to.emit(claimContract, 'OwnershipTransferred')
        .withArgs(owner.address, newOwner.address);

      expect(await claimContract.owner()).to.equal(newOwner.address);
      expect(await claimContract.pendingOwner()).to.equal(ethers.constants.AddressZero);
    });

    it('Should not allow non-pending owner to accept ownership', async () => {
      await claimContract.connect(newOwner).transferOwnership(owner.address);
      await expect(claimContract.connect(user1).acceptOwnership()).to.be.revertedWith(
        'Ownable2Step: caller is not the new owner',
      );

      // Clean up: return ownership to original owner
      await claimContract.connect(owner).acceptOwnership();
    });
  });

  describe('renounceOwnership', () => {
    it('Should not allow owner to renounce ownership', async () => {
      await expect(claimContract.connect(owner).renounceOwnership()).to.be.revertedWith(
        'Ownable2Step: can not renounce ownership',
      );

      // Verify that the owner hasn't changed
      expect(await claimContract.owner()).to.equal(owner.address);
    });

    it('Should not allow non-owner to renounce ownership', async () => {
      await expect(claimContract.connect(user1).renounceOwnership()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });
});
