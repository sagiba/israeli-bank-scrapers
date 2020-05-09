import makeTestCases from './converter.test-data';
import VisaCalTransactionConverter from './converter';

describe('VisaCal converter test', () => {
  test('convert-installments', () => {
    const converter = new VisaCalTransactionConverter();
    makeTestCases().forEach((tcase) => {
      expect(converter.convertTransaction(tcase.input)).toEqual(tcase.expected);
    });
  });
});
