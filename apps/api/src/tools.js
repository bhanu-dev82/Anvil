export const TOOLS = {
  merge: {
    id: "merge",
    name: "Merge",
    blurb: "Combine multiple PDFs into one.",
    minFiles: 2,
    maxFiles: 20,
    accept: ["application/pdf"],
  },
  split: {
    id: "split",
    name: "Split",
    blurb: "Extract a page range into a new PDF.",
    minFiles: 1,
    maxFiles: 1,
    accept: ["application/pdf"],
    options: ["from", "to"],
  },
  compress: {
    id: "compress",
    name: "Compress",
    blurb: "Shrink a PDF for sharing and uploads.",
    minFiles: 1,
    maxFiles: 1,
    accept: ["application/pdf"],
  },
  imagespdf: {
    id: "imagespdf",
    name: "Images → PDF",
    blurb: "Stack images into a single PDF.",
    minFiles: 1,
    maxFiles: 30,
    accept: ["image/png", "image/jpeg", "image/webp"],
  },
};

export function listTools() {
  return Object.values(TOOLS);
}
