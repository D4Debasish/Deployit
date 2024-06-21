const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();
const PORT = 9000;

const subscriber = new Redis(process.env.REDIS_URL);
const io = new Server({ cors: "*" });

io.on("connection", (socket) => {
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    socket.emit("message", `Joined ${channel}`);
  });
});

io.listen(9001, () => console.log("Socket 9001"));

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});
const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:339712983208:cluster/builder-clusterx",
  TASK: "arn:aws:ecs:ap-south-1:339712983208:task-definition/builder-task",
};

app.use(express.json());

app.post("/project", async (req, res) => {
  const { gitUrl } = req.body;
  const projectSlug = generateSlug();
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [
          "subnet-03f4e48555da3428e",
          "subnet-084d9cd3e99f31e6b",
          "subnet-0a9b5c54437272052",
        ],
        securityGroups: ["sg-0af742096b748c5ba"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-image",
          environment: [
            { name: "GIT_REPOSITORY__URL", value: gitURL },
            { name: "PROJECT_ID", value: projectSlug },
          ],
        },
      ],
    },
  });
  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

const initRedisSubscribe = async () => {
  console.log("Subscribed to logs....");
  subscriber.psubscribe("logs:*");
  subscriber.on("pmessage", (pattern, channel, message) => {
    io.to(channel).emit("message", message);
  });
};

initRedisSubscribe();

app.listen(PORT, () => console.log(`API SERVER Running..${PORT}`));
