import path from 'path'
import fs from 'fs'
import {spawn} from '@nebulario/core-process';
import {Operation, IO, Config} from '@nebulario/core-plugin-request';

export const start = (params, cxt) => {

  const {
    module: {
      code: {
        paths: {
          absolute: {
            folder
          }
        }
      }
    },
    modules
  } = params;

  IO.sendEvent("build.out.building", {
    data: ""
  }, cxt);

  const config = Config.get(folder, ".config", {});

  const filesToCopy = ["deployment.yaml", "service.yaml"];
  const outputPath = path.join(folder, "dist");

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }

  for (const compFile of filesToCopy) {
    const srcFile = path.join(folder, compFile);
    const destFile = path.join(outputPath, compFile);

    const raw = fs.readFileSync(srcFile, "utf8");
    const convert = Config.replace(raw, config);
    //const convert = raw;
    fs.writeFileSync(destFile, convert, "utf8");
  }

  IO.sendEvent("build.out.done", {
    data: ""
  }, cxt);

  return null;
}
