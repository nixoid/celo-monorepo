---
description: Exchange Celo Dollars and CELO via the stability mechanism
---

# Exchange

## Celo

Exchange CELO for Celo Dollars via the stability mechanism. \(Note: this is the equivalent of the old exchange:gold\)

```text
USAGE
  $ celocli exchange:celo

OPTIONS
  -k, --privateKey=privateKey                        Use a private key to sign local transactions with

  --forAtLeast=10000000000000000000000               [default: 0] Optional, the minimum value of Celo Dollars to receive
                                                     in return

  --from=0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d  (required) The address with CELO to exchange

  --ledgerAddresses=ledgerAddresses                  [default: 1] If --useLedger is set, this will get the first N
                                                     addresses for local signing

  --ledgerConfirmAddress                             Set it to ask confirmation for the address of the transaction from
                                                     the ledger

  --ledgerCustomAddresses=ledgerCustomAddresses      [default: [0]] If --useLedger is set, this will get the array of
                                                     index addresses for local signing. Example --ledgerCustomAddresses
                                                     "[4,99]"

  --useLedger                                        Set it to use a ledger wallet

  --value=10000000000000000000000                    (required) The value of CELO to exchange for Celo Dollars

EXAMPLES
  celo --value 5000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
  celo --value 5000000000000 --forAtLeast 100000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
```

_See code:_ [_packages/cli/src/commands/exchange/celo.ts_](https://github.com/celo-org/celo-monorepo/tree/master/packages/cli/src/commands/exchange/celo.ts)

## Dollars

Exchange Celo Dollars for CELO via the stability mechanism

```text
USAGE
  $ celocli exchange:dollars

OPTIONS
  -k, --privateKey=privateKey                        Use a private key to sign local transactions with

  --forAtLeast=10000000000000000000000               [default: 0] Optional, the minimum value of CELO to receive in
                                                     return

  --from=0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d  (required) The address with Celo Dollars to exchange

  --ledgerAddresses=ledgerAddresses                  [default: 1] If --useLedger is set, this will get the first N
                                                     addresses for local signing

  --ledgerConfirmAddress                             Set it to ask confirmation for the address of the transaction from
                                                     the ledger

  --ledgerCustomAddresses=ledgerCustomAddresses      [default: [0]] If --useLedger is set, this will get the array of
                                                     index addresses for local signing. Example --ledgerCustomAddresses
                                                     "[4,99]"

  --useLedger                                        Set it to use a ledger wallet

  --value=10000000000000000000000                    (required) The value of Celo Dollars to exchange for CELO

EXAMPLES
  dollars --value 10000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
  dollars --value 10000000000000 --forAtLeast 50000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
```

_See code:_ [_packages/cli/src/commands/exchange/dollars.ts_](https://github.com/celo-org/celo-monorepo/tree/master/packages/cli/src/commands/exchange/dollars.ts)

## Gold

Exchange CELO for Celo Dollars via the stability mechanism. _DEPRECATION WARNING_ Use the "exchange:celo" command instead

```text
USAGE
  $ celocli exchange:gold

OPTIONS
  -k, --privateKey=privateKey                        Use a private key to sign local transactions with

  --forAtLeast=10000000000000000000000               [default: 0] Optional, the minimum value of Celo Dollars to receive
                                                     in return

  --from=0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d  (required) The address with CELO to exchange

  --ledgerAddresses=ledgerAddresses                  [default: 1] If --useLedger is set, this will get the first N
                                                     addresses for local signing

  --ledgerConfirmAddress                             Set it to ask confirmation for the address of the transaction from
                                                     the ledger

  --ledgerCustomAddresses=ledgerCustomAddresses      [default: [0]] If --useLedger is set, this will get the array of
                                                     index addresses for local signing. Example --ledgerCustomAddresses
                                                     "[4,99]"

  --useLedger                                        Set it to use a ledger wallet

  --value=10000000000000000000000                    (required) The value of CELO to exchange for Celo Dollars

EXAMPLES
  gold --value 5000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
  gold --value 5000000000000 --forAtLeast 100000000000000 --from 0xc1912fEE45d61C87Cc5EA59DaE31190FFFFf232d
```

_See code:_ [_packages/cli/src/commands/exchange/gold.ts_](https://github.com/celo-org/celo-monorepo/tree/master/packages/cli/src/commands/exchange/gold.ts)

## Show

Show the current exchange rates offered by the Exchange

```text
USAGE
  $ celocli exchange:show

OPTIONS
  --amount=amount  [default: 1000000000000000000] Amount of the token being exchanged to report rates for

EXAMPLE
  list
```

_See code:_ [_packages/cli/src/commands/exchange/show.ts_](https://github.com/celo-org/celo-monorepo/tree/master/packages/cli/src/commands/exchange/show.ts)
