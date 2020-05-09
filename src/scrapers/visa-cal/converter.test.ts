import makeTestCases from './converter.test-data';
import VisaCalTransactionConverter from './converter';

describe('VisaCal converter test', () => {
  const converter = new VisaCalTransactionConverter();
  makeTestCases().forEach((tcase, name) => {
    test(name, () => {
      expect(converter.convertTransaction(tcase.input)).toEqual(tcase.expected);
    });
  });
});
