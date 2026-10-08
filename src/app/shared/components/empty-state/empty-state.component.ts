import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss'
})
export class EmptyStateComponent {
  @Input() icon: string = 'pi pi-compass';
  @Input() title: string = 'No activity yet';
  @Input() description: string = 'Find friends to see their trips, or start your own';
  @Input() primaryActionLabel: string = 'Create a Trip';
  @Input() primaryActionIcon: string = 'pi pi-plus';
  @Input() showPrimaryAction: boolean = true;
  @Input() secondaryActionLabel: string = 'Find Friends';
  @Input() secondaryActionIcon: string = 'pi pi-user-plus';
  @Input() showSecondaryAction: boolean = true;

  @Output() primaryAction = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();

  onPrimaryClick(): void {
    this.primaryAction.emit();
  }

  onSecondaryClick(): void {
    this.secondaryAction.emit();
  }
}
