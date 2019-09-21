import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import YAML from "yamljs";
import { spawn, wait, exec } from "@nebulario/core-process";
import { execSync } from "child_process";
import { IO, Performer } from "@nebulario/core-plugin-request";
import * as JsonUtils from "@nebulario/core-json";
import * as Cluster from "@nebulario/core-cluster";
const uuidv4 = require("uuid/v4");

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

  const handlers = {
    onInfo: (info, { file }) => {
      info && IO.sendOutput(info, cxt);
    },
    onRemoved: (info, { file }) => {
      IO.sendOutput(info, cxt);
      IO.sendEvent(
        "warning",
        {
          data: file + " removed..."
        },
        cxt
      );
    },
    onNotFound: ({ file }) => {
      IO.sendEvent(
        "warning",
        {
          data: file + " is not present..."
        },
        cxt
      );
    }
  };

  await Cluster.Control.remove(folder, "deployment.yaml", handlers, cxt);
  await Cluster.Control.remove(folder, "service.yaml", handlers, cxt);
};

const getLinkedServiceContainer = (performer, performers) => {
  let servicePerf = null;
  Performer.link(performer, performers, {
    onLinked: depPerformer => {
      if (
        depPerformer.module.type === "container" &&
        _.find(depPerformer.labels, lbl => lbl.startsWith("service:"))
      ) {
        servicePerf = depPerformer;
      }
    }
  });

  return servicePerf;
};

const getLinkedServiceApp = (performer, performers) => {
  let appPerf = null;
  Performer.link(performer, performers, {
    onLinked: depPerformer => {
      if (depPerformer.module.type === "npm") {
        appPerf = depPerformer;
      }
    }
  });

  return appPerf;
};

const restartPodsApp = async ({ performerid }, params, cxt) => {
  const {
    performers,
    performer,
    performer: {
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      },
      dependents,
      module: { dependencies }
    },
    instance: {
      instanceid,
      paths: {
        absolute: { folder: instanceFolder }
      }
    }
  } = params;

  const tmpPath = path.join(folder, "tmp");
  const deploymentTmpPath = path.join(tmpPath, "deployment.yaml");
  const deploy = JsonUtils.load(deploymentTmpPath, true);

  const pods = await Cluster.Control.getDeploymentPods(
    deploy.metadata.namespace,
    deploy.metadata.name,
    cxt
  );

  IO.sendEvent(
    "info",
    {
      data: "Pods " + pods
    },
    cxt
  );

  let servicePerf = getLinkedServiceContainer(performer, performers);

  if (servicePerf) {
    const paths = await Cluster.Minikube.execToHost(
      "find /home/docker/instances/" +
        path.join(instanceid, "modules", servicePerf.performerid) +
        " -type d -name " +
        performerid,
      cxt
    );

    const pathLines = paths.stdout.trim().split("\n");

    for (const line of pathLines) {
      await Cluster.Minikube.copyToHost(
        path.join(instanceFolder, "modules", performerid, "dist"),
        path.join(line, "dist"),
        cxt
      );
    }

    for (const podid of pods) {
      const cmdid = uuidv4();

      IO.sendEvent(
        "out",
        {
          data: "Restarting inner container app " + podid
        },
        cxt
      );

      await Cluster.Control.execToPod(
        deploy.metadata.namespace,
        podid,
        'echo "cmd:restart:' + cmdid + '" > /tmp/agent-input',
        cxt
      );
    }
  }
};

export const listen = async (params, cxt) => {
  const {
    performerid, // TRIGGER DEP
    operation: {
      params: opParams,
      params: {
        performer: { type },
        performers
      }
    }
  } = params;

  if (type === "instanced") {
    const triggerPerf = Performer.find(performerid, performers);

    if (triggerPerf && triggerPerf.module.type === "npm") {
      await restartPodsApp(triggerPerf, opParams, cxt);
    }
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
    },
    instance: {
      instanceid,
      paths: {
        absolute: { folder: instanceFolder }
      }
    }
  } = params;

  if (type === "instanced") {
    let servicePerf = getLinkedServiceContainer(performer, performers);

    if (servicePerf) {
      IO.sendEvent(
        "info",
        {
          data: "Initialize instance module... " + servicePerf.module.moduleid
        },
        cxt
      );

      await Cluster.Minikube.copyToHost(
        path.join(instanceFolder, "modules", servicePerf.module.moduleid),
        "/home/docker/instances/" +
          instanceid +
          "/modules/" +
          servicePerf.module.moduleid,
        cxt
      );
    }
  }
};

export const start = (params, cxt) => {
  const {
    init,
    performers,
    performer,
    performer: {
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      },
      dependents,
      module: { dependencies }
    },
    instance: { instanceid },
    plugins
  } = params;

  const tmpPath = path.join(folder, "tmp");
  const distPath = path.join(folder, "dist");

  const startOp = async (operation, cxt) => {
    let depSrvAppPerformer = null;
    IO.sendEvent(
      "out",
      {
        data: "Setting service config..."
      },
      cxt
    );

    const serviceDevPath = await Cluster.Dev.transform(
      "service.yaml",
      distPath,
      tmpPath,
      async content => {
        content.metadata.namespace =
          instanceid + "-" + content.metadata.namespace;
        return content;
      }
    );

    const srvout = await Cluster.Control.apply(serviceDevPath, cxt);
    IO.sendOutput(srvout, cxt);
    IO.sendEvent(
      "out",
      {
        data: "Setting deployment config..."
      },
      cxt
    );

    await Cluster.Dev.transform(
      "deployment.yaml",
      distPath,
      tmpPath,
      async (content, raw) => {
        const namespace = Cluster.Dev.get(raw, /namespace: (.+)/g);
        const host = Cluster.Dev.get(raw, /\s*name: HOST\s*value: (.+)/g);

        IO.sendEvent(
          "out",
          {
            data: "Setting deployment config..." + namespace + "  ---  " + host
          },
          cxt
        );

        let nraw = namespace
          ? Cluster.Dev.replace(raw, namespace, instanceid + "-" + namespace)
          : raw;
        nraw = host
          ? Cluster.Dev.replace(nraw, host, instanceid + "-" + host)
          : nraw;
        return nraw;
      }
    );

    const deploymentDevPath = await Cluster.Dev.transform(
      "deployment.yaml",
      tmpPath,
      tmpPath,
      async content => {
        content.spec.template.spec.volumes =
          content.spec.template.spec.volumes || [];

        let servicePerf = getLinkedServiceContainer(performer, performers);

        if (servicePerf) {
          const service = "app";
          IO.sendEvent(
            "out",
            {
              data: " - Service container " + service
            },
            cxt
          );

          const currCont = _.find(
            content.spec.template.spec.containers,
            ({ name }) => name === service
          );

          if (currCont) {
            const [imgName, imgVer] = currCont.image.split(":");
            currCont.image = imgName + ":linked";

            depSrvAppPerformer = getLinkedServiceApp(servicePerf, performers);

            if (depSrvAppPerformer) {
              IO.sendEvent(
                "info",
                {
                  data: " - Linked " + depSrvAppPerformer.performerid
                },
                cxt
              );

              const agent = _.find(
                plugins,
                ({ pluginid }) => pluginid === "agent:npm"
              );

              if (agent) {
                const appFullname = depSrvAppPerformer.module.fullname;

                currCont.command = ["sh"];
                currCont.args = [
                  "/agent/src/index.sh",
                  Buffer.from(
                    JSON.stringify({
                      ...params,
                      deployment: {
                        container: servicePerf,
                        app: depSrvAppPerformer
                      }
                    })
                  ).toString("base64")
                ];

                currCont.volumeMounts = currCont.volumeMounts || [];
                currCont.volumeMounts = [
                  {
                    name: "agent",
                    mountPath: "/agent"
                  },
                  {
                    name: "app",
                    mountPath: "/app"
                  },
                  ...currCont.volumeMounts
                ];

                content.spec.template.spec.volumes = [
                  {
                    name: "agent",
                    hostPath: {
                      path: "/home/docker/agent/" + instanceid + "/npm",
                      type: "Directory"
                    }
                  },
                  {
                    name: "app",
                    hostPath: {
                      path:
                        "/home/docker/instances/" +
                        instanceid +
                        "/modules/" +
                        servicePerf.module.moduleid,
                      type: "Directory"
                    }
                  },
                  ...content.spec.template.spec.volumes
                ];
              }
            }
          }
        }
        return content;
      }
    );

    const igosut = await Cluster.Control.apply(deploymentDevPath, cxt);
    IO.sendOutput(igosut, cxt);

    IO.sendEvent(
      "info",
      {
        data: "Service & deployment up to date..."
      },
      cxt
    );

    if (depSrvAppPerformer) {
      await restartPodsApp(depSrvAppPerformer, params, cxt);
    }

    IO.sendEvent("done", {}, cxt);

    while (operation.status !== "stopping") {
      await wait(100);
    }
  };

  return {
    promise: startOp,
    process: null
  };
};
