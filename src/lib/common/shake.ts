export default class ShakeSimulator {
  private isRunning: boolean
  private intervalId?: any

  constructor() {
    this.isRunning = false
  }

  public startShakeSimulation(duration: number = 1800, callback: Function): void {
    this.isRunning = true
    const startTime = Date.now()

    this.intervalId = setInterval(() => {
      if (!this.isRunning) return

      // 生成随机加速度值
      const x = this.randomAcceleration()
      const y = this.randomAcceleration()
      const z = this.randomAcceleration()

      callback({
        x,
        y,
        z
      })
      // 检查时间是否到达指定持续时间
      if (Date.now() - startTime > duration) {
        this.stopShakeSimulation()
      }
    }, 10)
  }
  private randomAcceleration(): number {
    // 随机生成一个模拟的加速度值
    return Math.random() * 15 - 5 // 产生 -10 到 15 之间的随机值
  }

  private stopShakeSimulation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
      this.isRunning = false
    }
  }
}
