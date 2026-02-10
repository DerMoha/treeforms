import { FormBuilder } from "@/components/builder/FormBuilder";

export default async function FormBuilderPage({
  params
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;

  return <FormBuilder formId={formId} />;
}
