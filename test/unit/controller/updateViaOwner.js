const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Owner Update Functions', () => {
  let controllerContract;
  let owner;
  let admin;
  let newAdmin;
  let tokenHolderAddresses;
  let rewarder;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const tokenHolders = await getTokenHolders();
    rewarder = await getRewardsManager();
    tokenHolderAddresses = tokenHolders.slice(0, 14).map((holder) => holder.address);
    newAdmin = await ethers.getSigner(tokenHolderAddresses[0]);
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
    await controllerContract.setExpiryRange(1, 100, 1000);
  });

  describe('updateNftTransferable', () => {
    it('Should allow owner to update NFT transferability', async () => {
      await expect(controllerContract.updateNftTransferable(true))
        .to.emit(controllerContract, 'EventNftTransferableUpdated')
        .withArgs(true);

      const metadata = await controllerContract.getMetadata();
      expect(metadata._nftTransferable).to.be.true;
    });

    it('Should not allow non-owner to update NFT transferability', async () => {
      await expect(
        controllerContract.connect(admin).updateNftTransferable(false),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('updateMinterAdmin', () => {
    it('Should allow owner to update minter admin', async () => {
      await expect(controllerContract.updateMinterAdmin(newAdmin.address))
        .to.emit(controllerContract, 'EventMinterAdminUpdated')
        .withArgs(newAdmin.address);

      const metadata = await controllerContract.getMetadata();
      expect(metadata._minterAdmin).to.equal(newAdmin.address);
    });

    it('Should not allow non-owner to update minter admin', async () => {
      await expect(
        controllerContract.connect(admin).updateMinterAdmin(admin.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('updateWhitelistAdmin', () => {
    it('Should allow owner to update whitelist admin', async () => {
      await expect(controllerContract.updateWhitelistAdmin(newAdmin.address))
        .to.emit(controllerContract, 'EventWhiteListAdminUpdated')
        .withArgs(newAdmin.address);

      const metadata = await controllerContract.getMetadata();
      expect(metadata._whitelistAdmin).to.equal(newAdmin.address);
    });

    it('Should not allow non-owner to update whitelist admin', async () => {
      await expect(
        controllerContract.connect(admin).updateWhitelistAdmin(admin.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('updateBanAdmin', () => {
    it('Should allow owner to update ban admin', async () => {
      await expect(controllerContract.updateBanAdmin(newAdmin.address))
        .to.emit(controllerContract, 'EventBanAdminUpdated')
        .withArgs(newAdmin.address);

      const metadata = await controllerContract.getMetadata();
      expect(metadata._banAdmin).to.equal(newAdmin.address);
    });

    it('Should not allow non-owner to update ban admin', async () => {
      await expect(
        controllerContract.connect(admin).updateBanAdmin(admin.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('updateRewardAdmin', () => {
    it('Should allow owner to update reward admin', async () => {
      await expect(controllerContract.updateRewardAdmin(newAdmin.address))
        .to.emit(controllerContract, 'EventRewardManagerAddressChanged')
        .withArgs(newAdmin.address);

      const metadata = await controllerContract.getMetadata();
      expect(metadata._rewardManager).to.equal(newAdmin.address);
    });

    it('Should not allow non-owner to update reward admin', async () => {
      await expect(
        controllerContract.connect(admin).updateRewardAdmin(admin.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should not allow updating reward admin to zero address', async () => {
      await expect(
        controllerContract.updateRewardAdmin(ethers.constants.AddressZero),
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('setExpiryRange', () => {
    it('Should not allow invalid range where startId > endId', async () => {
      await expect(controllerContract.setExpiryRange(200, 150, 1000)).to.be.revertedWith(
        'Invalid range',
      );
    });

    it('Should not allow overlapping range with existing range', async () => {
      await expect(controllerContract.setExpiryRange(50, 150, 1000)).to.be.revertedWith(
        'New range overlaps with existing range',
      );
    });

    it('Should allow valid sequential range', async () => {
      await expect(controllerContract.setExpiryRange(101, 200, 1000)).to.not.be.reverted;
    });

    it('Should set new additional expiry range', async () => {
      await expect(controllerContract.setExpiryRange(201, 300, 1000)).to.not.be.reverted;
    });
  });

  describe('updateExpiryRange', () => {
    it('Should not allow invalid index', async () => {
      await expect(controllerContract.updateExpiryRange(99, 1, 100, 1000)).to.be.revertedWith(
        'Invalid index',
      );
    });

    it('Should not allow invalid range where startId > endId', async () => {
      await expect(controllerContract.updateExpiryRange(1, 200, 150, 1000)).to.be.revertedWith(
        'Invalid range',
      );
    });

    it('Should not allow overlap with previous range when updating', async () => {
      await expect(controllerContract.updateExpiryRange(1, 50, 200, 1000)).to.be.revertedWith(
        'Range overlaps with previous range',
      );
    });

    it('Should not allow overlap with next range when updating', async () => {
      await expect(controllerContract.updateExpiryRange(1, 150, 250, 1000)).to.be.revertedWith(
        'Range overlaps with next range',
      );
    });

    it('Should allow valid update for first range', async () => {
      await expect(controllerContract.updateExpiryRange(0, 1, 50, 1000)).to.not.be.reverted;
    });

    it('Should allow valid update for middle range', async () => {
      await expect(controllerContract.updateExpiryRange(1, 101, 150, 1000)).to.not.be.reverted;
    });

    it('Should allow valid update for last range', async () => {
      await expect(controllerContract.updateExpiryRange(2, 201, 350, 1000)).to.not.be.reverted;
    });

    it('Should not allow non-owner to update expiry range', async () => {
      await expect(
        controllerContract.connect(admin).updateExpiryRange(0, 1, 50, 1000),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
