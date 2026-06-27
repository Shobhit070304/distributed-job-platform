"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHandler = getHandler;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
const handlers = {
    send_email: async (job) => {
        if (job.payload.simulateFailure) {
            throw new Error('Simulated email provider outage');
        }
        console.log(`Sending email to ${job.payload.to}...`);
        await sleep(1000); // simulate network latency to an email provider
        console.log(`Email sent for job ${job.id}`);
    },
    resize_image: async (job) => {
        if (job.payload.simulateFailure) {
            throw new Error('Simulated email provider outage');
        }
        console.log(`Resizing image ${job.payload.url}...`);
        await sleep(1500); // simulate CPU-bound work
        console.log(`Image resized for job ${job.id}`);
    },
};
function getHandler(type) {
    return handlers[type];
}
