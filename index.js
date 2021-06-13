const amqp = require('amqplib/callback_api');
const puppeteer = require('puppeteer');
const tmp = require("tmp");
const fs = require("fs");
const { setTimeout } = require('timers');

let browser;

function render(msg) {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await browser.newPage();
            await page.setContent(msg.html);
        
            await page.waitForSelector("h1");
        
            const filename = tmp.tmpNameSync({
                "postfix": ".png"
            });
        
            await page.screenshot({
                path: filename,
                clip: {
                    x: 0,
                    y: 0,
                    width: msg.width,
                    height: msg.height
                }
            });

            resolve(filename);
        
            page.close();
        } catch (error) {
            reject(error);
            return;
        }
    });
}

async function main() {
    browser = await puppeteer.launch();

    amqp.connect('amqp://localhost', (error, connection) => {
        if (error) {
            throw error;
        }

        connection.createChannel((error, channel) => {
            if (error) {
                throw error;
            }

            const queue = "render";
            
            channel.assertQueue(queue, {
                durable: false
            });

            channel.prefetch(1);

            channel.consume(queue, async (msg) => {
                const msgDecoded = JSON.parse(msg.content.toString());
                console.log(msgDecoded);
                const filename = await render(msgDecoded);
                const fileBuffer = fs.readFileSync(filename);

                const body = {
                    code: 0
                };
                const bodyJSON = JSON.stringify(body);
                const bodyBuffer = Buffer.from(bodyJSON);

                const bodyBytes = Buffer.byteLength(bodyBuffer);

                const buffer = Buffer.alloc(4);
                buffer.writeUInt32BE(bodyBytes);

                channel.publish("", msg.properties.replyTo, Buffer.concat([buffer, bodyBuffer, fileBuffer]));
                channel.ack(msg);
                console.log("Acked.");
                fs.unlinkSync(filename);
            });
        });
    });
}

main();