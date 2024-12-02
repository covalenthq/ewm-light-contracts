const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftController - Transfer Whitelist', () => {
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
    tokenHolderAddresses = tokenHolders.slice(0, 14).map((holder) => holder.address);

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
    await controllerContract.updateWhitelistAdmin(admin.address);
  });

  describe('updateTransferWhiteList', () => {
    it('Should allow whitelist admin to add addresses to the whitelist', async () => {
      const addressesToAdd = tokenHolderAddresses.slice(0, 5);
      await expect(controllerContract.connect(admin).updateTransferWhiteList(addressesToAdd, true))
        .to.not.be.reverted;

      for (const address of addressesToAdd) {
        expect(await controllerContract.inTransferWhitelist(address)).to.be.true;
      }
    });

    it('Should allow whitelist admin to remove addresses from the whitelist', async () => {
      const addressesToRemove = tokenHolderAddresses.slice(0, 5);
      await expect(
        controllerContract.connect(admin).updateTransferWhiteList(addressesToRemove, false),
      ).to.not.be.reverted;

      for (const address of addressesToRemove) {
        expect(await controllerContract.inTransferWhitelist(address)).to.be.false;
      }
    });

    it('Should not allow non-whitelist admin to update the whitelist', async () => {
      const addressesToAdd = tokenHolderAddresses.slice(5, 10);
      await expect(
        controllerContract.connect(owner).updateTransferWhiteList(addressesToAdd, true),
      ).to.be.revertedWith('only whitelist admin');
    });

    it('Should allow updating multiple addresses in a single transaction', async () => {
      const addressesToUpdate = tokenHolderAddresses.slice(5, 10);
      await expect(
        controllerContract.connect(admin).updateTransferWhiteList(addressesToUpdate, true),
      ).to.not.be.reverted;

      for (const address of addressesToUpdate) {
        expect(await controllerContract.inTransferWhitelist(address)).to.be.true;
      }

      await expect(
        controllerContract.connect(admin).updateTransferWhiteList(addressesToUpdate, false),
      ).to.not.be.reverted;

      for (const address of addressesToUpdate) {
        expect(await controllerContract.inTransferWhitelist(address)).to.be.false;
      }
    });

    it('Should handle empty address list', async () => {
      await expect(controllerContract.connect(admin).updateTransferWhiteList([], true)).to.not.be
        .reverted;
    });
  });

  describe('updateWhitelistTransferTime', () => {
    it('Should allow whitelist admin to update transfer time range', async () => {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 3600; // 1 hour from now

      await expect(
        controllerContract.connect(admin).updateWhitelistTransferTime(startTime, endTime),
      ).to.not.be.reverted;

      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(startTime);
      expect(returnedEndTime).to.equal(endTime);
    });

    it('Should not allow non-whitelist admin to update transfer time range', async () => {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 3600;

      await expect(
        controllerContract.connect(owner).updateWhitelistTransferTime(startTime, endTime),
      ).to.be.revertedWith('only whitelist admin');
    });

    it('Should allow updating to zero values', async () => {
      await expect(controllerContract.connect(admin).updateWhitelistTransferTime(0, 0)).to.not.be
        .reverted;

      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(0);
      expect(returnedEndTime).to.equal(0);
    });

    it('Should not allow setting end time before start time', async () => {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime - 3600; // 1 hour before start time

      await expect(
        controllerContract.connect(admin).updateWhitelistTransferTime(startTime, endTime),
      ).to.be.revertedWith('end time must be greater than start time');

      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(0);
      expect(returnedEndTime).to.equal(0);
    });

    it('Should allow updating transfer time range multiple times', async () => {
      const startTime1 = Math.floor(Date.now() / 1000);
      const endTime1 = startTime1 + 3600;

      await expect(
        controllerContract.connect(admin).updateWhitelistTransferTime(startTime1, endTime1),
      ).to.not.be.reverted;

      const startTime2 = startTime1 + 7200;
      const endTime2 = startTime2 + 3600;

      await expect(
        controllerContract.connect(admin).updateWhitelistTransferTime(startTime2, endTime2),
      ).to.not.be.reverted;

      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(startTime2);
      expect(returnedEndTime).to.equal(endTime2);
    });
  });
});
