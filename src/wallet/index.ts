import { ec } from 'elliptic';

import Blockchain from '../blockchain';
import ChainUtil from '../chain-util';
import { INITIAL_BALANCE } from '../config';
import { AmountExceedBalanceException } from '../errors';
import Transaction from './transaction';
import TransactionPool from './transaction-pool';

export default class Wallet {
  public balance: number;
  public keyPair: ec.KeyPair;
  public publicKey: string;
  public address: string;

  public constructor() {
    this.balance = INITIAL_BALANCE;
    this.keyPair = ChainUtil.genKeyPair();
    this.publicKey = this.keyPair.getPublic().encode('hex', false);
    this.address = '';
  }

  public toString(): string {
    return `Wallet -
      publicKey: ${this.publicKey.toString()}
      balance  : ${this.balance}`;
  }

  public sign(dataHash: string): ec.Signature {
    return this.keyPair.sign(dataHash);
  }

  public createTransaction(
    recipient: string,
    amount: number,
    blockchain: Blockchain,
    transactionPool: TransactionPool,
  ): Transaction {
    this.balance = this.calculateBalance(blockchain);

    if (amount > this.balance) {
      throw new AmountExceedBalanceException(amount, this.balance);
    }

    let transaction = transactionPool.existingTransaction(this.publicKey);

    if (transaction) {
      transaction.update(this, recipient, amount);
    } else {
      transaction = Transaction.newTransaction(this, recipient, amount);
      transactionPool.updateOrAddTransaction(transaction);
    }

    return transaction;
  }

  public calculateBalance(blockchain: Blockchain): number {
    let balance = this.balance;
    const transactions: Transaction[] = [];
    blockchain.chain.forEach((block) =>
      block.data.forEach((transaction) => {
        transactions.push(transaction);
      }),
    );

    const walletInputs = transactions.filter((transaction) => transaction.input.address === this.publicKey);

    let startTime = 0;

    if (walletInputs.length > 0) {
      const recentInput = walletInputs.reduce((prev, current) =>
        prev.input.timestamp > current.input.timestamp ? prev : current,
      );

      balance = recentInput.outputs.find((output) => output.address === this.publicKey)!.amount;
      startTime = recentInput.input.timestamp;
    }

    transactions?.forEach((transaction) => {
      if (transaction.input.timestamp > startTime) {
        transaction.outputs.forEach((output) => {
          if (output.address === this.publicKey) {
            balance += output.amount;
          }
        });
      }
    });

    return balance;
  }

  public static blockchainWallet(): Wallet {
    const blockchainWallet = new this();
    blockchainWallet.address = 'blockchain-wallet';
    return blockchainWallet;
  }
}
