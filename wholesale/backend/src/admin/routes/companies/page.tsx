import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useState } from "react";
import { BuildingStorefront } from "@medusajs/icons";
import {
  Avatar,
  Badge,
  Container,
  Heading,
  Select,
  Table,
  Text,
  Toaster,
} from "@medusajs/ui";
import { QueryCompany } from "../../../types";
import { useAdminCustomerGroups, useCompanies } from "../../hooks/api";
import { CompanyActionsMenu, CompanyCreateDrawer } from "./components";

// Company status in plain words (gap review 2026-11-24): new sign-ups wait
// as "pending" when WHOLESALE_REQUIRE_APPROVAL is on.
const STATUS: Record<string, { label: string; color: "orange" | "green" | "red" }> = {
  pending: { label: "Waiting for approval", color: "orange" },
  approved: { label: "Approved", color: "green" },
  suspended: { label: "Suspended", color: "red" },
};

const Companies = () => {
  const [status, setStatus] = useState("all");
  const { data, isPending } = useCompanies({
    fields:
      "*employees,*employees.customer,*employees.company,*customer_group,*approval_settings",
    ...(status === "all" ? {} : { status }),
  });

  const { data: customerGroups } = useAdminCustomerGroups();

  return (
    <>
      <Container className="flex flex-col p-0 overflow-hidden">
        <div className="p-6 flex justify-between">
          <Heading className="font-sans font-medium h1-core">Companies</Heading>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <Select.Trigger aria-label="Show companies" className="w-48">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All companies</Select.Item>
                <Select.Item value="pending">Waiting for approval</Select.Item>
                <Select.Item value="approved">Approved</Select.Item>
                <Select.Item value="suspended">Suspended</Select.Item>
              </Select.Content>
            </Select>
            <CompanyCreateDrawer />
          </div>
        </div>
        {isPending && <Text>Loading...</Text>}
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell></Table.HeaderCell>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Phone</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Address</Table.HeaderCell>
              <Table.HeaderCell>Employees</Table.HeaderCell>
              <Table.HeaderCell>Customer Group</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          {data?.companies && (
            <Table.Body>
              {data.companies.map((company: QueryCompany) => (
                <Table.Row
                  key={company.id}
                  className="cursor-pointer hover:bg-ui-bg-base-hover"
                  onClick={() =>
                    (window.location.href = `/app/companies/${company.id}`)
                  }
                >
                  <Table.Cell className="w-6 h-6 items-center justify-center">
                    <Avatar
                      src={company.logo_url || undefined}
                      fallback={company.name.charAt(0)}
                    />
                  </Table.Cell>
                  <Table.Cell>{company.name}</Table.Cell>
                  <Table.Cell>
                    {company.status && STATUS[company.status] ? (
                      <Badge size="small" color={STATUS[company.status].color}>
                        {STATUS[company.status].label}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </Table.Cell>
                  <Table.Cell>{company.phone}</Table.Cell>
                  <Table.Cell>{company.email}</Table.Cell>
                  <Table.Cell>{`${company.address}, ${company.city}, ${company.state} ${company.zip}`}</Table.Cell>
                  <Table.Cell>{company.employees?.length || 0}</Table.Cell>
                  <Table.Cell>
                    {company.customer_group?.name ? (
                      <Badge size="small" color="blue">
                        {company.customer_group.name}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </Table.Cell>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    <CompanyActionsMenu
                      company={company}
                      customerGroups={customerGroups}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          )}
        </Table>
      </Container>
      <Toaster />
    </>
  );
};

export const config = defineRouteConfig({
  label: "Companies",
  icon: BuildingStorefront,
});

export default Companies;
