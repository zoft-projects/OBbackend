import { App } from './app';
import { connectDB, disconnectDB, dropCollections } from './testUtils';

beforeAll(async () => {
  return connectDB();
});

afterEach(async () => {
  return dropCollections();
});

afterAll(async () => {
  return disconnectDB();
});

// mock the initializeLocalApp method, as supertest 'request' will initialize the app for us instead
jest.spyOn(App.prototype, 'initializeLocalApp').mockImplementation(async () => {
  return;
});
