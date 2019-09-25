import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import YAML from "yamljs";
import { exec, spawn, wait } from "@nebulario/core-process";
import {
  Operation,
  IO,
  Watcher,
  Performer
} from "@nebulario/core-plugin-request";
import * as Config from "@nebulario/core-config";
import * as Cluster from "@nebulario/core-cluster";
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

  if (type === "instanced") {
    await Config.clear(folder);
  }
};

export const init = async (params, cxt) => {
  const {
    performers,
    performer,
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

  if (type === "instanced") {
    Performer.link(performer, performers, {
      onLinked: depPerformer => {
        if (depPerformer.module.type === "config") {
          IO.sendEvent(
            "info",
            {
              data: depPerformer.performerid + " config linked!"
            },
            cxt
          );

          Config.link(folder, depPerformer.performerid);
        }
      }
    });
    await Config.init(folder);
  }
};

export const start = (params, cxt) => {
  const {
    performers,
    performer,
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

  if (type === "instanced") {
    const configPath = path.join(folder, "config.json");
    const servicePath = path.join(folder, "service.yaml");
    const deploymentPath = path.join(folder, "deployment.yaml");

    Performer.sendLinkStateEvents(performer, performers, cxt);

    const startOp = async (operation, cxt) => {
      const { operationid } = operation;

      build(operation, params, cxt);

      const watchers = Watcher.multiple(
        [configPath, servicePath, deploymentPath],
        changedPath => {
          IO.sendEvent(
            "warning",
            {
              data: changedPath + " changed..."
            },
            cxt
          );
          build(operation, params, cxt);
        }
      );

      while (operation.status !== "stopping") {
        await wait(100); //wait(2500);
      }

      Watcher.stop(watchers);

      IO.sendEvent(
        "warning",
        {
          data: "stopped!"
        },
        cxt
      );
    };

    return {
      promise: startOp,
      process: null
    };
  }
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
    const values = Config.load(folder);

    const src = path.join(folder, "");
    const dest = path.join(folder, "dist");

    Cluster.Config.configure("service.yaml", src, dest, values);
    Cluster.Config.configure("deployment.yaml", src, dest, values);

    IO.sendEvent(
      "done",
      {
        data: "Service generated!"
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
