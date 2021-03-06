import { InitializationState } from 'src/geth/reducer'

export enum Actions {
  SET_INIT_STATE = 'GETH/SET_INIT_STATE',
  SET_GETH_CONNECTED = 'GETH/SET_GETH_CONNECTED',
  SET_CHAIN_HEAD = 'GETH/SET_CHAIN_HEAD',
  CANCEL_GETH_SAGA = 'GETH/CANCEL_GETH_SAGA',
}

export interface SetInitStateAction {
  type: Actions.SET_INIT_STATE
  state: InitializationState
}

export const setInitState = (state: InitializationState): SetInitStateAction => ({
  type: Actions.SET_INIT_STATE,
  state,
})

export const cancelGethSaga = () => ({
  type: Actions.CANCEL_GETH_SAGA,
})

export interface SetGethConnectedAction {
  type: Actions.SET_GETH_CONNECTED
  connected: boolean
}

export const setGethConnected = (connected: boolean): SetGethConnectedAction => ({
  type: Actions.SET_GETH_CONNECTED,
  connected,
})

export interface ChainHead {
  number: number
  hash: string
  timestamp: number
}

export interface SetChainHeadAction {
  type: Actions.SET_CHAIN_HEAD
  head: ChainHead | null
}

export const setChainHead = (head: ChainHead | null): SetChainHeadAction => ({
  type: Actions.SET_CHAIN_HEAD,
  head,
})

export type ActionTypes = SetInitStateAction | SetGethConnectedAction | SetChainHeadAction
