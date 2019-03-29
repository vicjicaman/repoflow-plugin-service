import _ from 'lodash'
import fs from 'fs-extra'
import path from 'path'
import YAML from 'yamljs';
import {spawn} from '@nebulario/core-process';
import {IO} from '@nebulario/core-plugin-request';

const modify = (folder, compFile, func) => {
  const inputPath = path.join(folder, "dist");
  const outputPath = path.join(folder, "runtime");

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }

  const srcFile = path.join(inputPath, compFile);
  const destFile = path.join(outputPath, compFile);

  const raw = fs.readFileSync(srcFile, "utf8");
  const content = YAML.parse(raw);
  const mod = func(content);

  fs.writeFileSync(destFile, YAML.stringify(mod, 10, 2), "utf8");
}

export const start = (params, cxt) => {

  const {
    module: {
      moduleid,
      mode,
      fullname,
      code: {
        paths: {
          absolute: {
            folder
          }
        },
        dependencies
      },
      instance: {
        instanceid
      }
    },
    modules
  } = params;

  modify(folder, "service.yaml", content => content);
  modify(folder, "deployment.yaml", content => content);

  IO.sendEvent("run.started", {
    data: ""
  }, cxt);

  return null;
}
