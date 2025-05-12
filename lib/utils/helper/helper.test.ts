import { rtfToTxt, differenceInHours, differenceInMinutes } from './helper';

describe('Unit test for helper', () => {
  describe('rtf sanitizer helper', () => {
    it('should return plain text if not in rtf format', () => {
      const plainText = 'This is a plain text';

      expect(rtfToTxt(plainText)).toEqual('This is a plain text');
    });

    it('should parse a proper rtf text', () => {
      const rtfText =
        '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\margl1440\\margr1440\\vieww11520\\viewh8400\\viewkind0\n\\pard\\tx720\\tx1440\\tx2160\\tx2880\\tx3600\\tx4320\\tx5040\\tx5760\\tx6480\\tx7200\\tx7920\\tx8640\\pardirnatural\\partightenfactor0\n\n\\f0\\fs24 \\cf0 Testing a basic rtf file!}';

      expect(rtfToTxt(rtfText)).toEqual('Testing a basic rtf file!');
    });
  });

  describe('differenceInHours helper', () => {
    it('should return positive integer for hour difference when later time in future', () => {
      const startDateTime = new Date();
      const endDateTime = new Date();
      endDateTime.setHours(endDateTime.getHours() + 2);

      expect(differenceInHours(endDateTime, startDateTime, { roundingMethod: 'floor' })).toEqual(2);
    });

    // TODO: Should be moved to integration test eventually
    it('should return floored difference in hours based on the later time in future', () => {
      const scheduleTime = new Date('7/24/2024 10:00:00'); // 24th, 10:00AM

      const lookupTimePreviousDay = new Date('7/23/2024 23:00:00'); // 23rd, 11:00PM (Previous day)
      const lookupTimeNextDay = new Date('7/25/2024 01:00:00'); // 25th, 01:00AM (Next day)

      expect(differenceInHours(scheduleTime, lookupTimePreviousDay, { roundingMethod: 'floor' }) < -16).toBeFalsy();
      expect(differenceInHours(scheduleTime, lookupTimeNextDay, { roundingMethod: 'floor' }) < -16).toBeFalsy();
    });

    it('should return negative integer for hour difference when later time is in past', () => {
      const startDateTime = new Date();
      const endDateTime = new Date();
      endDateTime.setHours(endDateTime.getHours() - 2);

      expect(differenceInHours(endDateTime, startDateTime)).toEqual(-2);
    });
  });

  describe('differenceInMinutes helper', () => {
    it('should return difference in minutes', () => {
      const startTime = new Date('7/24/2024 11:00:00');
      const endTime1 = new Date('7/24/2024 11:00:00');
      const endTime2 = new Date('7/24/2024 13:00:00');

      expect(differenceInMinutes(endTime1, startTime)).toEqual(0);
      expect(differenceInMinutes(endTime2, startTime)).toEqual(120);
    });
  });
});
