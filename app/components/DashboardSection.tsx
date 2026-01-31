"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MOCK_BLOCKERS,
  MOCK_ACTIVITIES,
  AlertIcon,
  formatRelativeTime,
} from "@/lib/mockData";

interface DashboardSectionProps {
  kpiData: {
    total: number;
    inReview: number;
    blocked: number;
    avgDays: number;
  };
}

export function DashboardSection({ kpiData }: DashboardSectionProps) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your compliance pipeline</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Products</CardDescription>
            <CardTitle className="text-3xl">{kpiData.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across all markets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Review</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{kpiData.inReview}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Pending TTB approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Blockers</CardDescription>
            <CardTitle className="text-3xl text-destructive">{kpiData.blocked}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Requiring action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg. Days in Stage</CardDescription>
            <CardTitle className="text-3xl">{kpiData.avgDays}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Active products</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Distribution (Mocked Chart) */}
        <Card>
          <CardHeader>
            <CardTitle>Stage Distribution</CardTitle>
            <CardDescription>Products by compliance stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { stage: "Formula Approval", count: 2, color: "bg-orange-500" },
                { stage: "COLA/Labeling", count: 2, color: "bg-blue-500" },
                { stage: "Import/Customs", count: 1, color: "bg-purple-500" },
                { stage: "State Approvals", count: 1, color: "bg-green-500" },
                { stage: "Complete", count: 2, color: "bg-emerald-500" },
              ].map((item) => (
                <div key={item.stage} className="flex items-center gap-3">
                  <div className={cn("w-3 h-3 rounded-full", item.color)} />
                  <span className="flex-1 text-sm">{item.stage}</span>
                  <span className="text-sm font-medium">{item.count}</span>
                  <div className="w-24">
                    <Progress value={(item.count / 8) * 100} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Blockers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Blockers</CardTitle>
            <CardDescription>Issues requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {MOCK_BLOCKERS.map((blocker) => (
                <div key={blocker.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <AlertIcon className={cn(
                    "w-5 h-5 mt-0.5 shrink-0",
                    blocker.severity === "critical" ? "text-destructive" :
                    blocker.severity === "high" ? "text-orange-500" : "text-yellow-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{blocker.productName}</p>
                    <p className="text-xs text-muted-foreground truncate">{blocker.issue}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={
                        blocker.severity === "critical" ? "destructive" :
                        blocker.severity === "high" ? "default" : "secondary"
                      } className="text-[10px]">
                        {blocker.severity}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{blocker.daysOpen}d open</span>
                    </div>
                  </div>
                  <Avatar size="sm">
                    <AvatarFallback className="text-[10px]">{blocker.ownerInitials}</AvatarFallback>
                  </Avatar>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest compliance updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {MOCK_ACTIVITIES.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{activity.action}</span>
                    {" - "}
                    <span className="text-muted-foreground">{activity.product}</span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{activity.user}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(activity.timestamp)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
