import { SubmissionsDashboard } from "@/components/analytics/SubmissionsDashboard";

export default async function SubmissionsPage({
  params
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;

  return <SubmissionsDashboard formId={formId} />;
}
