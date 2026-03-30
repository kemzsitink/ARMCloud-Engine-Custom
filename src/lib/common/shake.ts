export interface AccelerationVector {
  x: number;
  y: number;
  z: number;
}

export type ShakeCallback = (vector: AccelerationVector) => void;

/** Simulates device shake by emitting random acceleration vectors at 100 Hz. */
export default class ShakeSimulator {
  private intervalId: ReturnType<typeof setInterval> | undefined;

  startShakeSimulation(duration = 1800, callback: ShakeCallback): void {
    const startTime = Date.now();

    this.intervalId = setInterval(() => {
      callback({
        x: this.randomAcceleration(),
        y: this.randomAcceleration(),
        z: this.randomAcceleration(),
      });

      if (Date.now() - startTime >= duration) {
        this.stopShakeSimulation();
      }
    }, 10);
  }

  stopShakeSimulation(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /** Returns a random value in the range [-5, 10). */
  private randomAcceleration(): number {
    return Math.random() * 15 - 5;
  }
}
