import { PublicFormRunner } from "@/components/runtime/PublicFormRunner";

export default async function HostedFormPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; version: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { slug, version } = await params;
  const query = await searchParams;

  return (
    <PublicFormRunner
      slug={slug}
      version={version}
      resumeTokenFromQuery={query.resume}
    />
  );
}
