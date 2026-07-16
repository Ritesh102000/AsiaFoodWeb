import Storefront from "../storefront";

export default async function Page({ params }: { params: Promise<{ route?: string[] }> }) {
  const { route = [] } = await params;
  return <Storefront route={route} />;
}
