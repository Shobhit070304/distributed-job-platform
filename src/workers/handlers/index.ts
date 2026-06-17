import { Job } from "../../models/job.types";

type JobHandler = (job: Job) => Promise<void>;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const handlers: Record<string, JobHandler> = {
    send_email: async (job) => {
        console.log(`Sending email to ${job.payload.to}...`);
        await sleep(1000); // simulate network latency to an email provider
        console.log(`Email sent for job ${job.id}`);
    },

    resize_image: async (job) => {
        console.log(`Resizing image ${job.payload.url}...`);
        await sleep(1500); // simulate CPU-bound work
        console.log(`Image resized for job ${job.id}`);
    },
}

export function getHandler(type: string): JobHandler | undefined {
    return handlers[type];
}