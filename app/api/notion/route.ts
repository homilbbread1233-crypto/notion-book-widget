import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveBody = {
  title: string;
  author: string;
  link: string;
  cover?: string;
  publisher?: string;
  isbn13?: string;
};

/**
 * 이미지 MIME 타입에 맞는 확장자를 결정
 */
function getImageExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

/**
 * 카카오 표지 이미지를 다운로드한 뒤
 * Notion File Upload API를 통해 실제 파일로 업로드
 */
async function uploadCoverToNotion(
  coverUrl: string,
  notionToken: string
): Promise<{
  id: string;
  filename: string;
}> {
  // 1. 카카오 표지 이미지 다운로드
  const imageRes = await fetch(coverUrl, {
    cache: "no-store",
  });

  if (!imageRes.ok) {
    throw new Error(
      `Cover download failed: ${imageRes.status}`
    );
  }

  const contentType =
    imageRes.headers.get("content-type") || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error(
      `Cover is not an image: ${contentType}`
    );
  }

  const imageBuffer = await imageRes.arrayBuffer();

  const extension = getImageExtension(contentType);
  const filename = `cover.${extension}`;

  // 2. Notion에 File Upload 객체 생성
  const createUploadRes = await fetch(
    "https://api.notion.com/v1/file_uploads",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify({
        mode: "single_part",
        filename,
        content_type: contentType,
      }),
    }
  );

  const createUploadData = await createUploadRes
    .json()
    .catch(() => ({} as any));

  if (!createUploadRes.ok) {
    console.error(
      "[Notion File Upload create error]",
      createUploadData
    );

    throw new Error(
      `Notion file upload creation failed: ${createUploadRes.status}`
    );
  }

  const fileUploadId = createUploadData?.id;

  if (!fileUploadId) {
    throw new Error("Missing Notion file upload ID");
  }

  // 3. 실제 이미지 파일 전송
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([imageBuffer], {
      type: contentType,
    }),
    filename
  );

  const sendUploadRes = await fetch(
    `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": "2026-03-11",
      },
      body: formData,
    }
  );

  const sendUploadData = await sendUploadRes
    .json()
    .catch(() => ({} as any));

  if (!sendUploadRes.ok) {
    console.error(
      "[Notion File Upload send error]",
      sendUploadData
    );

    throw new Error(
      `Notion file upload send failed: ${sendUploadRes.status}`
    );
  }

  return {
    id: fileUploadId,
    filename,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SaveBody;

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = process.env.NOTION_DATABASE_ID;

    // 환경변수 확인
    if (!NOTION_TOKEN) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing NOTION_TOKEN",
        },
        { status: 500 }
      );
    }

    if (!DATABASE_ID) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing NOTION_DATABASE_ID",
        },
        { status: 500 }
      );
    }

    const {
      title,
      author,
      link,
      cover,
      publisher,
      isbn13,
    } = body;

    // 필수값 확인
    if (!title || !link) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing required fields (title/link)",
        },
        { status: 400 }
      );
    }

    const finalPublisher =
      publisher?.trim() || null;

    /**
     * 먼저 표지를 제외한 기본 속성으로
     * Notion 페이지를 생성
     */
    const properties: any = {
      제목: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },

      링크: {
        url: link,
      },
    };

    // 저자
    if (author?.trim()) {
      properties["저자"] = {
        rich_text: [
          {
            text: {
              content: author.trim(),
            },
          },
        ],
      };
    }

    // ISBN13
    if (isbn13?.trim()) {
      properties["ISBN13"] = {
        rich_text: [
          {
            text: {
              content: isbn13.trim(),
            },
          },
        ],
      };
    }

    // 출판사
    if (finalPublisher) {
      properties["출판사"] = {
        rich_text: [
          {
            text: {
              content: finalPublisher,
            },
          },
        ],
      };
    }

    /**
     * Notion 페이지 생성
     *
     * 기존 프로젝트가 정상 작동하던
     * 2022-06-28 + database_id 방식을 그대로 유지
     */
    const notionRes = await fetch(
      "https://api.notion.com/v1/pages",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },

        body: JSON.stringify({
          parent: {
            database_id: DATABASE_ID,
          },

          properties,
        }),
      }
    );

    const data = await notionRes
      .json()
      .catch(() => ({} as any));

    if (!notionRes.ok) {
      console.error(
        "Notion API error:",
        data
      );

      return NextResponse.json(
        {
          ok: false,
          message: "Notion error",
          error: data,
        },
        { status: 500 }
      );
    }

    const pageId = data?.id;

    if (!pageId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing created Notion page ID",
        },
        { status: 500 }
      );
    }

    /**
     * 표지가 있는 경우:
     *
     * 카카오 이미지
     * → 서버에서 다운로드
     * → Notion 실제 파일로 업로드
     * → 방금 만든 페이지의 "표지" 속성에 연결
     */
    let coverUploaded = false;
    let coverError: string | null = null;

    if (cover?.trim()) {
      try {
        const uploadedCover =
          await uploadCoverToNotion(
            cover.trim(),
            NOTION_TOKEN
          );

        const updateCoverRes = await fetch(
          `https://api.notion.com/v1/pages/${pageId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${NOTION_TOKEN}`,
              "Content-Type": "application/json",
              "Notion-Version": "2026-03-11",
            },
            body: JSON.stringify({
              properties: {
                표지: {
                  type: "files",
                  files: [
                    {
                      type: "file_upload",
                      file_upload: {
                        id: uploadedCover.id,
                      },
                      name: uploadedCover.filename,
                    },
                  ],
                },
              },
            }),
          }
        );

        const updateCoverData =
          await updateCoverRes
            .json()
            .catch(() => ({} as any));

        if (!updateCoverRes.ok) {
          console.error(
            "[Notion cover property update error]",
            updateCoverData
          );

          throw new Error(
            `Notion cover property update failed: ${updateCoverRes.status}`
          );
        }

        coverUploaded = true;
      } catch (coverUploadError: any) {
        console.error(
          "[Cover upload error]",
          coverUploadError
        );

        coverError =
          coverUploadError?.message ||
          "Cover upload failed";
      }
    }

    /**
     * 표지 업로드만 실패하더라도
     * 이미 저장된 책 데이터는 삭제하지 않음
     */
    return NextResponse.json({
      ok: true,
      coverUploaded,
      coverError,
    });
  } catch (e: any) {
    console.error("Save error:", e);

    return NextResponse.json(
      {
        ok: false,
        message: "Server error",
      },
      { status: 500 }
    );
  }
}