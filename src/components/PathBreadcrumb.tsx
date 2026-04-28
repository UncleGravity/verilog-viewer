import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Props = {
  path: string[];
  onNavigate: (index: number) => void;
};

export function PathBreadcrumb({ path, onNavigate }: Props) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {path.map((name, i) => {
          const isLast = i === path.length - 1;
          return (
            <Fragment key={`${i}-${name}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-mono">{name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    className="font-mono cursor-pointer"
                  >
                    <button type="button" onClick={() => onNavigate(i)}>
                      {name}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
