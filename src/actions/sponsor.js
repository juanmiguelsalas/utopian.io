import { CALL_API } from '../middlewares/api';
import * as Actions from '../actions/constants';

export const createSponsorRequest = (account) => ({
  [CALL_API]: {
    types: [ Actions.CREATE_SPONSOR_REQUEST, Actions.CREATE_SPONSOR_SUCCESS, Actions.CREATE_CONTRIBUTION_FAILURE ],
    endpoint: `sponsors`,
    schema: null,
    method: 'POST',
    payload: {
      account
    },
    additionalParams: {},
    absolute: false
  }
});

export const createSponsor = account => dispatch => dispatch(createSponsorRequest(account));
