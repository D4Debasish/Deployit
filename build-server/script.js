const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const mime = require("mime-types");
const Redis = require("ioredis");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const publisher = new Redis(process.env.REDIS_URL);

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const PROJECT_ID = process.env.PROJECT_ID;

const publishlog = (log) => {
  publisher.publish(`logs: ${PROJECT_ID}`, JSON.stringify({ log }));
};

async function init() {
  console.log("running script");
  publishlog("Building start");
  const outDirPath = path.join(__dirname, "output");
  console.log(`path is ${outDirPath}`);
  if (!fs.existsSync(outDirPath)) {
    console.log(`No path ${outDirPath}`);
    return;
  }

  const execute = exec(`cd ${outDirPath} && npm install && npm run build`);
  execute.stdout.on("data", function (data) {
    console.log(data.toString());
    publishlog(data.toString());
  });
  execute.stderr.on("error", function (data) {
    console.log("error is in exec", data.toString());
    publishlog(`error is : ${data.toString()}`);
  });
  execute.on("close", async function () {
    console.log("Build Complete");
    publishlog("Build COmplete");
    const distFolderPath = path.join(__dirname, "output", "dist");
    if (!fs.existsSync(distFolderPath)) {
      console.error(`Directory ${distFolderPath} does not exist`);
      return;
    }
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("uploading", filePath);

      const command = new PutObjectCommand({
        Bucket: "deploymyproj",
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      });

      await s3Client.send(command);

      console.log("uploaded", filePath);
      publishlog(`uploaded : ${filePath}`);
    }

    console.log("Done...");
  });
}

init();
