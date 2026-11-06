interface UploadReponse {
    success: boolean,
    filename: string,
    text: string
};

export async function uploadDocument(file: File): Promise<UploadReponse> {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch("http://localhost:4000/api/upload/document", {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Upload failed");
    }

    return result
}