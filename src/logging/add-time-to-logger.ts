/* eslint-disable @typescript-eslint/ban-ts-comment */
import { PinoLogger } from 'nestjs-pino';

declare module 'nestjs-pino' {
  interface PinoLogger {
    _timeMap: Map<string, number>;
    time(name: string): void;
    timeEnd(name: string): void;
  }
}

PinoLogger.prototype.time = function (this: PinoLogger, name: string): void {
  if (!this._timeMap) {
    this._timeMap = new Map();
  }

  this._timeMap.set(name, Date.now());
};

PinoLogger.prototype.timeEnd = function (this: PinoLogger, name: string): void {
  if (!this._timeMap?.get(name)) {
    return;
  }

  const time = Date.now() - this._timeMap.get(name);
  this._timeMap.delete(name);

  this.info(`Time ${name}: ${time} ms`);
};
