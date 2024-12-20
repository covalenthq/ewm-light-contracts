// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import {ERC20Permit} from './ERC20Permit/ERC20Permit.sol';

/**
 * @title CovalentXTokenFaucet
 * @dev CovalentXTokenFaucet
 */
contract CovalentXTokenFaucet is ERC20Permit, Ownable {
  constructor(
    string memory name,
    string memory symbol,
    uint256 totalSupply
  ) public ERC20(name, symbol) Ownable() {
    _mint(msg.sender, totalSupply);
  }
  /**
   * @notice Function to rescue funds
   * Owner is assumed to be a governance/multi-sig, Which will be used to rescue accidently sent user tokens
   * In case of no use this funtion can be disabled by destroying ownership via `renounceOwnership` function
   * @param token Address of token to be rescued
   * @param destination User address
   * @param amount Amount of tokens
   */
  function rescueTokens(address token, address destination, uint256 amount) external onlyOwner {
    require(token != destination, 'Invalid address');
    require(ERC20(token).transfer(destination, amount), 'Retrieve failed');
  }

  function faucet(address recipient, uint256 amount) public {
    _mint(recipient, amount);
  }
}
