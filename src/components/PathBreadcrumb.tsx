import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { prettyName } from "@/lib/names";

type Props = {
  path: string[];
  onNavigate: (index: number) => void;
};

export function PathBreadcrumb({ path, onNavigate }: Props) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {path.map((name, i) => {
          const isLast = i === path.length - 1;
          const label = prettyName(name);
          return (
            <Fragment key={`${i}-${name}`}>
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage
                    className="font-mono truncate"
                    title={name}
                  >
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    className="font-mono cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate(i)}
                      title={name}
                      className="truncate max-w-[12rem]"
                    >
                      {label}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className="text-foreground/60 [&>svg]:size-4" />
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
