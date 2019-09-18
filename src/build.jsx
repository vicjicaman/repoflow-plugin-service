import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import YAML from "yamljs";
import { exec, spawn, wait } from "@nebulario/core-process";
import { Operation, IO, Watcher } from "@nebulario/core-plugin-request";
import * as Config from "@nebulario/core-config";
import * as JsonUtils from "@nebulario/core-json";

export const clear = async (params, cxt) => {
  const {
    performer: {
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      }
    }
  } = params;

  if (type !== "instanced") {
    throw new Error("PERFORMER_NOT_INSTANCED");
  }

  try {
    await Config.clear(folder);
  } catch (e) {
    IO.sendEvent(
      "error",
      {
        data: e.toString()
      },
      cxt
    );
    throw e;
  }

  return "Configuration cleared";
};

export const init = async (params, cxt) => {
  const {
    performers,
    performer: {
      dependents,
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      }
    }
  } = params;

  if (type !== "instanced") {
    throw new Error("PERFORMER_NOT_INSTANCED");
  }

  for (const depSrv of dependents) {
    const depSrvPerformer = _.find(performers, {
      performerid: depSrv.moduleid
    });

    if (depSrvPerformer) {
      IO.sendEvent(
        "out",
        {
          data: "Performing dependent found " + depSrv.moduleid
        },
        cxt
      );

      if (depSrvPerformer.linked && depSrvPerformer.module.type === "config") {
        IO.sendEvent(
          "info",
          {
            data: " - Linked " + depSrv.moduleid
          },
          cxt
        );

        JsonUtils.sync(folder, {
          filename: "config.json",
          path: "dependencies." + depSrv.moduleid + ".version",
          version: "file:./../" + depSrv.moduleid
        });
      } else {
        IO.sendEvent(
          "warning",
          {
            data: " - Not linked " + depSrv.moduleid
          },
          cxt
        );
      }
    }
  }

  try {
    await Config.init(folder);
  } catch (e) {
    IO.sendEvent(
      "error",
      {
        data: e.toString()
      },
      cxt
    );
    throw e;
  }

  return "Config service initialized";
};

export const start = (params, cxt) => {
  const {
    performers,
    performer: {
      dependents,
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      }
    }
  } = params;

  if (type !== "instanced") {
    throw new Error("PERFORMER_NOT_INSTANCED");
  }

  const configPath = path.join(folder, "config.json");
  const servicePath = path.join(folder, "service.yaml");
  const deploymentPath = path.join(folder, "deployment.yaml");

  for (const depSrv of dependents) {
    const depSrvPerformer = _.find(performers, {
      performerid: depSrv.moduleid
    });

    if (depSrvPerformer) {
      IO.sendEvent(
        "out",
        {
          data: "Performing dependent found " + depSrv.moduleid
        },
        cxt
      );

      if (depSrvPerformer.linked) {
        IO.sendEvent(
          "info",
          {
            data: " - Linked " + depSrv.moduleid
          },
          cxt
        );
      } else {
        IO.sendEvent(
          "warning",
          {
            data: " - Not linked " + depSrv.moduleid
          },
          cxt
        );
      }
    }
  }

  const watcher = async (operation, cxt) => {
    const { operationid } = operation;

    IO.sendEvent(
      "out",
      {
        operationid,
        data: "Watching config changes for " + configPath
      },
      cxt
    );

    build(operation, params, cxt);

    const watcherConfig = Watcher.watch(configPath, () => {
      IO.sendEvent(
        "out",
        {
          operationid,
          data: "config.json changed..."
        },
        cxt
      );
      build(operation, params, cxt);
    });
    const watcherNamespace = Watcher.watch(servicePath, () => {
      IO.sendEvent(
        "out",
        {
          operationid,
          data: "service.yaml changed..."
        },
        cxt
      );
      build(operation, params, cxt);
    });
    const watcherIngress = Watcher.watch(deploymentPath, () => {
      IO.sendEvent(
        "out",
        {
          operationid,
          data: "deployment.yaml changed..."
        },
        cxt
      );
      build(operation, params, cxt);
    });

    while (operation.status !== "stopping") {
      await wait(2500);
    }

    watcherConfig.close();
    watcherIngress.close();
    watcherNamespace.close();
    await wait(100);

    IO.sendEvent(
      "stopped",
      {
        operationid,
        data: ""
      },
      cxt
    );
  };

  return {
    promise: watcher,
    process: null
  };
};

const build = (operation, params, cxt) => {
  const {
    performer: {
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      }
    }
  } = params;

  const { operationid } = operation;

  try {
    IO.sendEvent(
      "out",
      {
        operationid,
        data: "Start building config..."
      },
      cxt
    );

    Config.build(folder);

    const config = JsonUtils.load(path.join(folder, "config.json"));
    const values = Config.values(folder, config);

    const filesToCopy = ["deployment.yaml", "service.yaml"];
    const outputPath = path.join(folder, "dist");

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    for (const compFile of filesToCopy) {
      const srcFile = path.join(folder, compFile);
      const destFile = path.join(outputPath, compFile);

      const raw = fs.readFileSync(srcFile, "utf8");
      const convert = Config.replace(raw, values);
      fs.writeFileSync(destFile, convert, "utf8");

      postProcessEnv(destFile);

      const raw2 = fs.readFileSync(destFile, "utf8");
      fs.writeFileSync(destFile, raw2.replace(new RegExp("- yes", "g"), "- 'yes'"), "utf8");
    }

    IO.sendEvent(
      "done",
      {
        data: "Config generated: dist/config.json"
      },
      cxt
    );
  } catch (e) {
    IO.sendEvent(
      "error",
      {
        operationid,
        data: e.toString()
      },
      cxt
    );
  }
};

const postProcessEnv = file => {
  const ent = JsonUtils.load(file, true);

  if (_.get(ent, "spec.template.spec.containers", null)) {
    ent.spec.template.spec.containers = ent.spec.template.spec.containers.map(
      cont => {
        if (cont.env) {
          cont.env = cont.env.map(entry => {
            entry.value = entry.value.toString();
            return entry;
          });
        }
        return cont;
      }
    );
  }

  JsonUtils.save(file, ent, true);
};
