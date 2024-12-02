const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  deployMockAllowanceContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftClaim - Only Claim Admin Functions', () => {
  let claimContract;
  let controllerContract;
  let owner;
  let admin;
  let user1;
  let user2;
  let user3;
  let rewarder;
  let mockAllowanceContract1;
  let mockAllowanceContract2;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const tokenHolders = await getTokenHolders();
    rewarder = await getRewardsManager();
    user1 = tokenHolders[0];
    user2 = tokenHolders[1];
    user3 = tokenHolders[2];

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

    // Setup mock allowance contracts
    mockAllowanceContract1 = await deployMockAllowanceContract(owner);
    mockAllowanceContract2 = await deployMockAllowanceContract(owner);

    // Setup allowances
    // In the before() function:
    await mockAllowanceContract1.setTotalNftToMint(user1.address, 5);
    await mockAllowanceContract1.setTotalNftToMint(user2.address, 3);
    await mockAllowanceContract2.setTotalNftToMint(user2.address, 2);
    await mockAllowanceContract2.setTotalNftToMint(user3.address, 4);

    // Setup for tests
    await controllerContract.updateMinterAdmin(claimContract.address);
    await claimContract.unpause();
  });

  describe('updateAllowanceContractsArray', () => {
    it('Should allow claim admin to update allowance contracts array', async () => {
      await expect(
        claimContract
          .connect(admin)
          .updateAllowanceContractsArray([
            mockAllowanceContract1.address,
            mockAllowanceContract2.address,
          ]),
      ).to.not.be.reverted;

      const updatedArray = await claimContract.getAllowanceContractsArray();
      expect(updatedArray).to.deep.equal([
        mockAllowanceContract1.address,
        mockAllowanceContract2.address,
      ]);
    });

    it('Should revert when trying to set empty array', async () => {
      await expect(
        claimContract.connect(admin).updateAllowanceContractsArray([]),
      ).to.be.revertedWith('Allowance contracts array cannot be empty');
    });

    it('Should revert when array contains zero address', async function () {
      const newContracts = [mockAllowanceContract1.address, ethers.constants.AddressZero];

      await expect(
        claimContract.connect(admin).updateAllowanceContractsArray(newContracts),
      ).to.be.revertedWith('Invalid allowance contract address');
    });

    it('Should not allow non-admin to update allowance contracts array', async () => {
      await expect(
        claimContract
          .connect(user1)
          .updateAllowanceContractsArray([mockAllowanceContract1.address]),
      ).to.be.revertedWith('only claim admin');
    });
  });

  describe('adminClaim', () => {
    it('Should allow claim admin to claim NFTs for a user', async () => {
      await expect(claimContract.connect(admin).adminClaim(user1.address, 2))
        .to.emit(claimContract, 'EventClaim')
        .withArgs(user1.address, 2);

      expect(await claimContract.totalNftClaimed(user1.address)).to.equal(2);
    });

    it('Should not allow claim admin to claim for blacklisted user', async () => {
      await claimContract.connect(admin).updateBlacklist(user1.address, true);
      await expect(claimContract.connect(admin).adminClaim(user1.address, 2)).to.be.revertedWith(
        'blacklisted user',
      );
    });

    it('Should not allow non-admin to use adminClaim', async () => {
      await expect(claimContract.connect(user1).adminClaim(user2.address, 1)).to.be.revertedWith(
        'only claim admin',
      );
    });
  });

  describe('updateBlacklist', () => {
    it('Should allow claim admin to add a user to the blacklist', async () => {
      await expect(claimContract.connect(admin).updateBlacklist(user2.address, true)).to.not.be
        .reverted;

      expect(await claimContract.inBlacklist(user2.address)).to.be.true;
    });

    it('Should allow claim admin to remove a user from the blacklist', async () => {
      await claimContract.connect(admin).updateBlacklist(user2.address, false);
      expect(await claimContract.inBlacklist(user2.address)).to.be.false;
    });

    it('Should not allow non-admin to update the blacklist', async () => {
      await expect(
        claimContract.connect(user1).updateBlacklist(user3.address, true),
      ).to.be.revertedWith('only claim admin');
    });
  });

  describe('adminBatchClaim', () => {
    it('Should allow claim admin to batch claim NFTs for multiple users', async () => {
      await expect(
        claimContract.connect(admin).adminBatchClaim([user2.address, user3.address], [1, 2]),
      )
        .to.emit(claimContract, 'EventClaim')
        .withArgs(user2.address, 1)
        .and.to.emit(claimContract, 'EventClaim')
        .withArgs(user3.address, 2);

      expect(await claimContract.totalNftClaimed(user2.address)).to.equal(1);
      expect(await claimContract.totalNftClaimed(user3.address)).to.equal(2);
    });

    it('Should not allow batch claim if any user is blacklisted', async () => {
      await claimContract.connect(admin).updateBlacklist(user1.address, true);

      await expect(
        claimContract.connect(admin).adminBatchClaim([user1.address, user2.address], [1, 2]),
      ).to.be.revertedWith('blacklisted user in batch');
    });

    it('Should not allow non-admin to use adminBatchClaim', async () => {
      await expect(
        claimContract.connect(user1).adminBatchClaim([user2.address], [1]),
      ).to.be.revertedWith('only claim admin');
    });

    it('Should revert if array lengths do not match', async () => {
      await expect(
        claimContract.connect(admin).adminBatchClaim([user2.address, user3.address], [1]),
      ).to.be.revertedWith('array length should be same');
    });

    it('Should not allow claiming more than available', async () => {
      await expect(
        claimContract.connect(admin).adminBatchClaim([user2.address], [6]),
      ).to.be.revertedWith('claim amount should be less than or equal to unclaimed nft count');
    });
  });

  describe('adminBatchClaimAll', () => {
    it('Should allow admin to batch claim all remaining NFTs for multiple users', async () => {
      const unclaimedUser2 = await claimContract.unClaimedNftCount(user2.address);
      const unclaimedUser3 = await claimContract.unClaimedNftCount(user3.address);

      await expect(claimContract.connect(admin).adminBatchClaimAll([user2.address, user3.address]))
        .to.emit(claimContract, 'EventClaim')
        .withArgs(user2.address, unclaimedUser2)
        .and.to.emit(claimContract, 'EventClaim')
        .withArgs(user3.address, unclaimedUser3);

      expect(await claimContract.totalNftClaimed(user2.address)).to.equal(5);
      expect(await claimContract.totalNftClaimed(user3.address)).to.equal(4);
    });

    it('Should not allow batch claim all if any user is blacklisted', async () => {
      await claimContract.connect(admin).updateBlacklist(user1.address, true);

      await expect(
        claimContract.connect(admin).adminBatchClaimAll([user1.address, user2.address]),
      ).to.be.revertedWith('blacklisted user in batch');
    });

    it('Should not emit events or change state for users with no unclaimed NFTs', async () => {
      await claimContract.connect(admin).adminBatchClaimAll([user2.address, user3.address]);

      await expect(
        claimContract.connect(admin).adminBatchClaimAll([user2.address, user3.address]),
      ).to.not.emit(claimContract, 'EventClaim');

      expect(await claimContract.totalNftClaimed(user2.address)).to.equal(5);
      expect(await claimContract.totalNftClaimed(user3.address)).to.equal(4);
    });

    it('Should not allow non-admin to use adminBatchClaimAll', async () => {
      await expect(
        claimContract.connect(user1).adminBatchClaimAll([user2.address]),
      ).to.be.revertedWith('only claim admin');
    });
  });

  describe('Interaction with pausable', () => {
    it('Should not allow admin functions when contract is paused', async () => {
      await claimContract.connect(owner).pause();

      await expect(claimContract.connect(admin).adminClaim(user1.address, 1)).to.be.revertedWith(
        'Pausable: paused',
      );

      await expect(
        claimContract.connect(admin).adminBatchClaim([user1.address], [1]),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        claimContract.connect(admin).adminBatchClaimAll([user1.address]),
      ).to.be.revertedWith('Pausable: paused');

      await claimContract.connect(owner).unpause();
    });
  });

  describe('Interaction with pausable', () => {
    it('Should not allow admin functions when contract is paused', async () => {
      await claimContract.connect(owner).pause();

      await expect(claimContract.connect(admin).adminClaim(user1.address, 1)).to.be.revertedWith(
        'Pausable: paused',
      );

      await expect(
        claimContract.connect(admin).adminBatchClaim([user1.address], [1]),
      ).to.be.revertedWith('Pausable: paused');

      await expect(
        claimContract.connect(admin).adminBatchClaimAll([user1.address]),
      ).to.be.revertedWith('Pausable: paused');

      await claimContract.connect(owner).unpause();
    });
  });
});
