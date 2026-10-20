import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class AdminPanelErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Card role="alert">
        <CardContent className="space-y-3 py-8 text-center">
          <h3 className="font-bold">تعذر تحميل إدارة الحصص الحضورية</h3>
          <p className="text-sm text-muted-foreground">
            بقيت لوحة الإدارة متاحة. أعد المحاولة أو ارجع إلى تبويب آخر.
          </p>
          <Button variant="outline" onClick={() => this.setState({ failed: false })}>
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }
}
