import { runTenThousandPersonBenchmark } from '../src/simulation/engine/scaleBenchmark'

const result = await runTenThousandPersonBenchmark(process.env.WORLD_BENCHMARK_SEED)
console.info(JSON.stringify(result, null, 2))
