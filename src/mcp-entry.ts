import { main } from "./mcp";
main().catch(e=>{console.error((e as Error).message);process.exitCode=1;});
