// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

contract MockEwmNftAllowance {
  mapping(address => uint256) public totalNftToMint;
  uint256 public totalStakeReceived;
  uint256 public stakePrice;

  function setTotalNftToMint(address user, uint256 amount) external {
    totalNftToMint[user] = amount;
  }

  function setTotalStakeReceived(uint256 amount) external {
    totalStakeReceived = amount;
  }

  function setStakePrice(uint256 price) external {
    stakePrice = price;
  }
}
