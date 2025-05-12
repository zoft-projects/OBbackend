import expressRequestId from 'express-request-id';
import { HttpHeader } from '../../enums';

export const addTransactionId = expressRequestId({
  headerName: HttpHeader.TX_ID,
  attributeName: 'txId',
});
